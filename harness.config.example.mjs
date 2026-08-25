const teamNumber = "X"; // replace after team assignment
const runId = 1; // increment for every measured/test run
const keySlot = 1; // 1 or 2; must exist in the ignored .env
const modelProfile = "deepseek-honey"; // or "glm-caveman"

const profiles = {
  "deepseek-honey": {
    model: "yoink@openailike/deepseek-v4-flash-0731",
    compression: "skill",
  },
  "glm-caveman": {
    model: "yoink@openailike/glm-5.2-caveman",
    compression: "model",
  },
};
const selectedProfile = profiles[modelProfile];
if (!selectedProfile) throw new Error(`Unknown modelProfile: ${modelProfile}`);
if (![1, 2].includes(keySlot)) throw new Error(`keySlot must be 1 or 2: ${keySlot}`);
if (!Number.isInteger(runId) || runId < 1) throw new Error(`runId must be a positive integer: ${runId}`);

export default {
  // Scored-run routing. Keep API-key values only in the ignored .env.
  baseUrl: "https://my.orq.ai/v3/router",
  model: selectedProfile.model,
  compression: selectedProfile.compression,
  apiKeyEnv: `HACKATHON_API_KEY_${keySlot}`,
  identityId: `team-${teamNumber}-run-${runId}`,

  // Application repository Pi may read and modify. Relative paths start here.
  workspacePath: ".", // e.g. "../hackathon-app" or an absolute path
  lcaSkill: true,       // false for experiments driven only by copied slice documents

  browser: false,        // true only when UI acceptance checks need browser-harness
  orchestration: false,  // must remain false during a scored run
  orchestrationMaxRequests: 3,
  compressToolOutput: true, // collapse repeats and bound bash output before it reaches context
  verifyCommand: "",    // e.g. "npm test"; runs locally after Pi stops
  maxRequests: 0,        // no parent request cap; behavioral skill controls scope
  maxSessionRequests: 0, // no conversation request cap
  reserveFinalRequest: false, // handoff is explicit, never an automatic extra request
  contextWarnTokens: 12000, // local warning only; 0 disables
  maxContextTokens: 0,      // no hard context cutoff; use the warning and /new
  maxBashOutputChars: 8000, // keep the start and error-heavy tail
  maxOutputTokens: 4000, // room for bounded edits; a length stop blocks automatic retry
};
