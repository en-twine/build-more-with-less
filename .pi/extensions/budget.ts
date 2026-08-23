import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const taskLimit = Number(process.env.PI_MAX_TURNS ?? 6);
const sessionLimit = Number(process.env.PI_MAX_SESSION_REQUESTS ?? 12);
const contextWarnTokens = Number(process.env.PI_CONTEXT_WARN_TOKENS ?? 12000);
const contextLimitTokens = Number(process.env.PI_MAX_CONTEXT_TOKENS ?? 20000);

type Meter = { requests: number; input: number; cache: number; output: number; cost: number };

function emptyMeter(): Meter {
  return { requests: 0, input: 0, cache: 0, output: 0, cost: 0 };
}

function addUsage(meter: Meter, usage: { input: number; cacheRead: number; output: number; cost: { total: number } }) {
  meter.input += usage.input;
  meter.cache += usage.cacheRead;
  meter.output += usage.output;
  meter.cost += usage.cost.total;
}

export default function (pi: ExtensionAPI) {
  let task = emptyMeter();
  const session = emptyMeter();
  let cappedReason = "";
  let contextWarned = false;

  pi.on("session_start", (_event, ctx) => {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "assistant" && entry.message.usage.totalTokens) {
        session.requests += 1;
        addUsage(session, entry.message.usage);
      } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
        addUsage(session, entry.message.usage);
        const nestedRequests = Number((entry.message.details as { requests?: unknown } | undefined)?.requests ?? 0);
        if (Number.isInteger(nestedRequests) && nestedRequests > 0) session.requests += nestedRequests;
      } else if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.usage) {
        session.requests += 1;
        addUsage(session, entry.usage);
      }
    }
  });

  pi.on("input", (event) => {
    if (event.streamingBehavior) return;
    task = emptyMeter();
    cappedReason = "";
  });

  pi.on("turn_end", (event) => {
    if (event.message.role !== "assistant") return;
    const usage = event.message.usage;
    if (!usage.totalTokens) return;
    task.requests += 1;
    session.requests += 1;
    addUsage(task, usage);
    addUsage(session, usage);
  });

  pi.on("tool_result", (event) => {
    if (!event.usage) return;
    addUsage(task, event.usage);
    addUsage(session, event.usage);
    const nestedRequests = Number((event.details as { requests?: unknown } | undefined)?.requests ?? 0);
    if (Number.isInteger(nestedRequests) && nestedRequests > 0) {
      task.requests += nestedRequests;
      session.requests += nestedRequests;
    }
  });

  pi.on("before_provider_request", (_event, ctx) => {
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    if (sessionLimit > 0 && session.requests >= sessionLimit) {
      cappedReason = `session request cap (${sessionLimit})`;
    } else if (taskLimit > 0 && task.requests >= taskLimit) {
      cappedReason = `task request cap (${taskLimit})`;
    } else if (contextLimitTokens > 0 && contextTokens >= contextLimitTokens) {
      cappedReason = `context cap (${contextTokens}/${contextLimitTokens} tokens)`;
    }
    if (cappedReason) {
      if (ctx.hasUI) ctx.ui.notify(`Stopped before another AI request: ${cappedReason}. Use /new for the next item.`, "warning");
      ctx.abort();
      return;
    }
    if (!contextWarned && contextWarnTokens > 0 && contextTokens >= contextWarnTokens) {
      contextWarned = true;
      if (ctx.hasUI) ctx.ui.notify(`Context warning: ${contextTokens} tokens. Finish this item or use /new.`, "warning");
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if ((!task.requests && !cappedReason) || !ctx.hasUI) return;
    const taskCost = task.cost ? `€${task.cost.toFixed(4)}` : "unpriced";
    const sessionCost = session.cost ? `€${session.cost.toFixed(4)}` : "unpriced";
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    ctx.ui.notify(
      `Task ${task.requests}${taskLimit ? `/${taskLimit}` : ""} req · ${task.input} input + ${task.cache} cached + ${task.output} output · ${taskCost} | Session ${session.requests}${sessionLimit ? `/${sessionLimit}` : ""} req · ${sessionCost} · ctx ${contextTokens}`,
      cappedReason ? "warning" : "info",
    );
  });
}
