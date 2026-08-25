import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const defaultBaseUrl = "https://api.greenpt.ai/v1";
const defaultModel = "glm-5.2-honey";
const baseUrl = (process.env.PI_RUNTIME_BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
const model = process.env.PI_RUNTIME_MODEL || defaultModel;
const keyVariable = process.env.PI_RUNTIME_API_KEY_ENV || "GREENPT_API_KEY";
const identityId = process.env.PI_RUNTIME_IDENTITY_ID?.trim();
const maxTokens = Number(process.env.PI_RUNTIME_MAX_TOKENS || 1200);
const price = model === "yoink@openailike/deepseek-v4-flash-0731"
  ? { input: 0.14, output: 0.35, cacheRead: 0.14, cacheWrite: 0 }
  : model === "yoink@openailike/glm-5.2-caveman"
    ? { input: 1.1, output: 4.4, cacheRead: 1.1, cacheWrite: 0 }
    : baseUrl === defaultBaseUrl && model === defaultModel
      ? { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 0 }
    : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export default function (pi: ExtensionAPI) {
  pi.registerProvider("hackathon", {
    name: "Hackathon API",
    baseUrl,
    api: "openai-completions",
    apiKey: `$${keyVariable}`,
    headers: identityId ? { "X-ORQ-IDENTITY-ID": identityId } : undefined,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
    models: [{
      id: model,
      name: model,
      reasoning: false,
      input: ["text"],
      contextWindow: 131072,
      maxTokens,
      cost: price,
    }],
  });
}
