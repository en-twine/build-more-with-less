import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const limit = Number(process.env.PI_MAX_TURNS ?? 6);

export default function (pi: ExtensionAPI) {
  let turns = 0;
  let input = 0;
  let cache = 0;
  let output = 0;
  let cost = 0;
  let capped = false;

  pi.on("input", (event) => {
    if (event.streamingBehavior) return;
    turns = input = cache = output = cost = 0;
    capped = false;
  });

  pi.on("turn_end", (event) => {
    if (event.message.role !== "assistant") return;
    const usage = event.message.usage;
    if (!usage.totalTokens) return;
    turns += 1;
    input += usage.input;
    cache += usage.cacheRead;
    output += usage.output;
    cost += usage.cost.total;
  });

  pi.on("tool_result", (event) => {
    if (!event.usage) return;
    input += event.usage.input;
    cache += event.usage.cacheRead;
    output += event.usage.output;
    cost += event.usage.cost.total;
    const nestedRequests = Number((event.details as { requests?: unknown } | undefined)?.requests ?? 0);
    if (Number.isInteger(nestedRequests) && nestedRequests > 0) turns += nestedRequests;
  });

  pi.on("before_provider_request", (_event, ctx) => {
    if (limit > 0 && turns >= limit) {
      capped = true;
      ctx.abort();
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!turns || !ctx.hasUI) return;
    const prefix = capped ? `Stopped at ${limit}-turn cap` : `${turns} request${turns === 1 ? "" : "s"}`;
    const costText = cost ? `€${cost.toFixed(4)}` : "cost unpriced";
    ctx.ui.notify(`${prefix} · ${input} input + ${cache} cached + ${output} output · ${costText}`, capped ? "warning" : "info");
  });
}
