#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  if (typeof process.loadEnvFile !== "function") {
    console.error("Automatic .env loading requires a current Node.js version. Update Node.js or export the API key before starting Pi.");
    process.exit(2);
  }
  const exportedEnv = { ...process.env };
  process.loadEnvFile(envPath);
  Object.assign(process.env, exportedEnv);
}
const configPath = path.join(root, "harness.config.mjs");
if (!existsSync(configPath)) {
  console.error("Missing local harness.config.mjs. Copy harness.config.example.mjs and set the event values.");
  process.exit(2);
}
const { default: config } = await import(pathToFileURL(configPath));
const browserEnabled = process.env.PI_BROWSER === undefined ? config.browser : process.env.PI_BROWSER === "1";
const orchestrationEnabled = process.env.PI_ORCHESTRATION === undefined
  ? config.orchestration
  : process.env.PI_ORCHESTRATION === "1";
const orchestrationMaxRequests = Number(config.orchestrationMaxRequests ?? 3);
const compression = process.env.PI_HONEY_SKILL === "1" ? "skill" : config.compression;
const honeySkillEnabled = compression === "skill";
const baseUrl = process.env.HACKATHON_BASE_URL || config.baseUrl;
const model = process.env.HACKATHON_MODEL || config.model;
const apiKeyEnv = process.env.HACKATHON_API_KEY ? "HACKATHON_API_KEY" : config.apiKeyEnv;
const verifyCommand = process.env.PI_VERIFY_CMD ?? config.verifyCommand;
const maxRequests = process.env.PI_MAX_TURNS ?? config.maxRequests;
const maxSessionRequests = process.env.PI_MAX_SESSION_REQUESTS ?? config.maxSessionRequests;
const reserveFinalRequest = process.env.PI_RESERVE_FINAL_REQUEST === undefined
  ? config.reserveFinalRequest !== false
  : process.env.PI_RESERVE_FINAL_REQUEST === "1";
const contextWarnTokens = process.env.PI_CONTEXT_WARN_TOKENS ?? config.contextWarnTokens;
const maxContextTokens = process.env.PI_MAX_CONTEXT_TOKENS ?? config.maxContextTokens;
const maxBashOutputChars = process.env.PI_MAX_BASH_OUTPUT_CHARS ?? config.maxBashOutputChars;
const maxOutputTokens = Number(process.env.PI_MAX_OUTPUT_TOKENS ?? config.maxOutputTokens);
const workspacePath = path.resolve(root, process.env.PI_WORKSPACE || config.workspacePath || ".");
const compressedModel = /(?:^|-)(?:honey|ponytail|caveman)(?:-|$)/i.test(model);

if (!["model", "skill", "none"].includes(compression)) {
  console.error(`Invalid compression mode: ${compression}`);
  process.exit(2);
}
if (honeySkillEnabled && compressedModel) {
  console.error(`Honey skill cannot be combined with compression model ${model}`);
  process.exit(2);
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
  console.error(`Invalid API-key environment variable name: ${apiKeyEnv}`);
  process.exit(2);
}
if (!Number.isInteger(Number(maxRequests)) || Number(maxRequests) < 0) {
  console.error(`maxRequests must be a non-negative integer: ${maxRequests}`);
  process.exit(2);
}
for (const [name, value] of [
  ["maxSessionRequests", maxSessionRequests],
  ["contextWarnTokens", contextWarnTokens],
  ["maxContextTokens", maxContextTokens],
]) {
  if (!Number.isInteger(Number(value)) || Number(value) < 0) {
    console.error(`${name} must be a non-negative integer: ${value}`);
    process.exit(2);
  }
}
if (!Number.isInteger(Number(maxBashOutputChars)) || Number(maxBashOutputChars) < 500) {
  console.error(`maxBashOutputChars must be an integer of at least 500: ${maxBashOutputChars}`);
  process.exit(2);
}
if (Number(maxContextTokens) > 0 && Number(contextWarnTokens) > Number(maxContextTokens)) {
  console.error(`contextWarnTokens cannot exceed maxContextTokens`);
  process.exit(2);
}
if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
  console.error(`maxOutputTokens must be a positive integer: ${maxOutputTokens}`);
  process.exit(2);
}
if (!Number.isInteger(orchestrationMaxRequests) || orchestrationMaxRequests < 1) {
  console.error(`orchestrationMaxRequests must be a positive integer: ${orchestrationMaxRequests}`);
  process.exit(2);
}
try {
  if (!statSync(workspacePath).isDirectory()) {
    throw new Error("not a directory");
  }
} catch {
  console.error(`Workspace path is not a directory: ${workspacePath}`);
  process.exit(2);
}

// save_handoff is registered but locally hidden until the reserved final request.
const tools = ["read", "write", "edit", "bash", "save_handoff"];
const args = [
  "--provider", "hackathon",
  "--model", model,
  "--thinking", "off",
  "--approve",
  "--skill", path.join(root, ".pi/skills/build-more-with-less/SKILL.md"),
  "--extension", path.join(root, ".pi/extensions/provider.ts"),
  "--extension", path.join(root, ".pi/extensions/budget.ts"),
];

if (config.compressToolOutput) {
  args.push("--extension", path.join(root, ".pi/extensions/compress.ts"));
}

if (honeySkillEnabled) {
  args.push("--skill", path.join(root, ".pi/skills/honey-lean/SKILL.md"));
}

if (browserEnabled) {
  tools.push("browser");
  args.push("--extension", path.join(root, ".pi/extensions/browser.ts"));
}
if (orchestrationEnabled) {
  tools.push("delegate");
  args.push("--extension", path.join(root, ".pi/extensions/delegate.ts"));
}
if (verifyCommand) {
  args.push("--extension", path.join(root, ".pi/extensions/verify.ts"));
}
args.push("--tools", tools.join(","), ...process.argv.slice(2));

const childEnv = {
  ...process.env,
  PI_CODING_AGENT_DIR: path.join(root, ".pi/agent"),
  PI_RUNTIME_BASE_URL: baseUrl,
  PI_RUNTIME_MODEL: model,
  PI_RUNTIME_API_KEY_ENV: apiKeyEnv,
  PI_RUNTIME_MAX_TOKENS: String(maxOutputTokens),
  PI_MAX_TURNS: String(maxRequests),
  PI_MAX_SESSION_REQUESTS: String(maxSessionRequests),
  PI_RESERVE_FINAL_REQUEST: reserveFinalRequest ? "1" : "0",
  PI_HANDOFF_FILE: path.join(root, ".pi-handoff.md"),
  PI_HANDOFF_SENDER: `Pi coding agent (${model})`,
  PI_CONTEXT_WARN_TOKENS: String(contextWarnTokens),
  PI_MAX_CONTEXT_TOKENS: String(maxContextTokens),
  PI_MAX_BASH_OUTPUT_CHARS: String(maxBashOutputChars),
  PI_BROWSER: browserEnabled ? "1" : "0",
  PI_ORCHESTRATION: orchestrationEnabled ? "1" : "0",
  PI_ORCHESTRATION_MAX_REQUESTS: String(orchestrationMaxRequests),
  PI_RUNTIME_HONEY_SKILL: honeySkillEnabled ? "1" : "0",
  PI_VERIFY_CMD: verifyCommand,
};

console.log(`Workspace: ${workspacePath}`);
const result = spawnSync(process.env.PI_BIN || "pi", args, {
  cwd: workspacePath,
  env: childEnv,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
