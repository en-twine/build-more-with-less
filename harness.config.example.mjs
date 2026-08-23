export default {
  // Event API. Keep the secret itself out of this file.
  baseUrl: "https://api.example.com/v1",
  model: "replace-with-event-model",
  apiKeyEnv: "HACKATHON_API_KEY",

  // Application repository Pi may read and modify. Relative paths start here.
  workspacePath: ".", // e.g. "../hackathon-app" or an absolute path

  // "model": selected model carries compression; "skill": load local Honey Lean;
  // "none": use neither. Never combine "skill" with Honey/Ponytail/Caveman IDs.
  compression: "model",

  browser: false,        // true only when UI acceptance checks need browser-harness
  orchestration: false,  // opt-in: allow one bounded Pi subagent per task
  orchestrationMaxRequests: 3,
  compressToolOutput: true, // collapse repeats and bound bash output before it reaches context
  verifyCommand: "",    // e.g. "npm test"; runs locally after Pi stops
  maxRequests: 6,        // per user task; 0 disables
  maxSessionRequests: 12, // whole conversation, including subagents; 0 disables
  contextWarnTokens: 12000, // local warning only; 0 disables
  maxContextTokens: 20000,  // stop before another request; 0 disables
  maxBashOutputChars: 8000, // keep the start and error-heavy tail
  maxOutputTokens: 1200, // raise if a response ends with stopReason "length"
};
