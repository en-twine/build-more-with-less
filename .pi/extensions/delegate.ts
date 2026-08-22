import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const roles = ["scout", "worker", "reviewer"] as const;
const roleConfig = {
  scout: {
    tools: "read,bash",
    prompt: "Inspect only. Return the smallest set of concrete findings needed by the parent. Do not modify files.",
  },
  worker: {
    tools: "read,write,edit,bash",
    prompt: "Implement only the delegated task. Run its narrowest deterministic check and stop when it passes.",
  },
  reviewer: {
    tools: "read,bash",
    prompt: "Review only the delegated scope against its acceptance criteria. Do not modify files. Return only actionable findings; say green if none.",
  },
} as const;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configuredChildRequestLimit = Number(process.env.PI_ORCHESTRATION_MAX_REQUESTS || 3);
const parentRequestLimit = Number(process.env.PI_MAX_TURNS || 0);
const outputLimit = 6_000;

type Totals = {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
};

function emptyTotals(): Totals {
  return {
    requests: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function invocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  return { command: process.env.PI_BIN || "pi", args };
}

function textFrom(message: any): string {
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text)
    .join("\n")
    .trim();
}

async function runChild(
  role: typeof roles[number],
  task: string,
  cwd: string,
  requestLimit: number,
  signal?: AbortSignal,
) {
  const selected = roleConfig[role];
  const args = [
    "--mode", "json", "--print", "--no-session", "--approve",
    "--no-context-files", "--no-prompt-templates", "--no-extensions", "--no-skills",
    "--provider", "hackathon", "--model", process.env.PI_RUNTIME_MODEL || "glm-5.2-honey",
    "--thinking", "off",
    "--skill", path.join(root, ".pi/skills/build-more-with-less/SKILL.md"),
    "--extension", path.join(root, ".pi/extensions/provider.ts"),
    "--extension", path.join(root, ".pi/extensions/budget.ts"),
    "--extension", path.join(root, ".pi/extensions/compress.ts"),
    "--tools", selected.tools,
    "--append-system-prompt", selected.prompt,
  ];
  if (process.env.PI_RUNTIME_HONEY_SKILL === "1") {
    args.push("--skill", path.join(root, ".pi/skills/honey-lean/SKILL.md"));
  }
  args.push(`Task: ${task}`);

  const totals = emptyTotals();
  let finalText = "";
  let stderr = "";
  const childEnv = {
    ...process.env,
    PI_ORCHESTRATION: "0",
    PI_MAX_TURNS: String(requestLimit),
  };

  const result = await new Promise<number>((resolve, reject) => {
    const child = invocation(args);
    const proc = spawn(child.command, child.args, {
      cwd,
      env: childEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";

    const consume = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type !== "message_end" || event.message?.role !== "assistant") return;
      totals.requests += 1;
      const usage = event.message.usage;
      if (usage) {
        totals.input += usage.input || 0;
        totals.output += usage.output || 0;
        totals.cacheRead += usage.cacheRead || 0;
        totals.cacheWrite += usage.cacheWrite || 0;
        totals.totalTokens += usage.totalTokens || 0;
        for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
          totals.cost[key] += usage.cost?.[key] || 0;
        }
      }
      const text = textFrom(event.message);
      if (text) finalText = text;
    };

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) consume(line);
    });
    proc.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-2_000); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      consume(buffer);
      resolve(code ?? 1);
    });
    const abort = () => proc.kill("SIGTERM");
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });

  if (result !== 0) throw new Error(`Delegated ${role} failed (exit ${result}): ${stderr || "no output"}`);
  return { text: (finalText || `${role} completed without a text result`).slice(-outputLimit), totals };
}

export default function (pi: ExtensionAPI) {
  if (process.env.PI_ORCHESTRATION !== "1") return;
  let used = false;
  let completedParentRequests = 0;
  pi.on("input", (event) => {
    if (event.streamingBehavior) return;
    used = false;
    completedParentRequests = 0;
  });
  pi.on("turn_end", (event) => {
    if (event.message.role === "assistant") completedParentRequests += 1;
  });
  pi.registerTool(defineTool({
    name: "delegate",
    label: "Delegate",
    description: "Run one bounded Pi subagent in isolated context. This spends extra API requests: use only when the user explicitly asks for delegation or independent review.",
    parameters: Type.Object({
      role: StringEnum(roles),
      task: Type.String({ description: "One self-contained delegated task, including exact paths and acceptance criteria." }),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (used) throw new Error("Only one delegation is allowed per user task");
      const remainingForChild = parentRequestLimit > 0
        ? parentRequestLimit - completedParentRequests - 2 // current parent call plus its final response
        : configuredChildRequestLimit;
      const requestLimit = Math.min(configuredChildRequestLimit, remainingForChild);
      if (requestLimit < 1) throw new Error("No request budget remains for delegation plus a parent response");
      if (params.task.length < 3 || params.task.length > 2_000) {
        throw new Error("Delegated task must contain 3-2000 characters");
      }
      used = true;
      onUpdate?.({ content: [{ type: "text", text: `Running one ${params.role} subagent…` }], details: {} });
      const { text, totals } = await runChild(params.role, params.task, ctx.cwd, requestLimit, signal);
      return {
        content: [{ type: "text", text }],
        details: { role: params.role, requests: totals.requests },
        usage: {
          input: totals.input,
          output: totals.output,
          cacheRead: totals.cacheRead,
          cacheWrite: totals.cacheWrite,
          totalTokens: totals.totalTokens,
          cost: totals.cost,
        },
      };
    },
  }));
}
