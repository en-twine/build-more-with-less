export default {
  // Event API. Keep the secret itself out of this file.
  baseUrl: "https://api.greenpt.ai/v1",
  model: "glm-5.2-honey",
  apiKeyEnv: "GREENPT_API_KEY",

  // "model": selected model carries compression; "skill": load local Honey Lean;
  // "none": use neither. Never combine "skill" with Honey/Ponytail/Caveman IDs.
  compression: "model",

  browser: false,        // true only when UI acceptance checks need browser-harness
  compressToolOutput: true, // collapse only consecutive identical lines in long bash logs
  verifyCommand: "",    // e.g. "npm test"; runs locally after Pi stops
  maxRequests: 6,        // 0 disables the provider-request ceiling
  maxOutputTokens: 1200, // raise if a response ends with stopReason "length"
};
