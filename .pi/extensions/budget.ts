import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";

const taskLimit = Number(process.env.PI_MAX_TURNS ?? 6);
const sessionLimit = Number(process.env.PI_MAX_SESSION_REQUESTS ?? 12);
const reserveFinalRequest = process.env.PI_RESERVE_FINAL_REQUEST !== "0";
const contextWarnTokens = Number(process.env.PI_CONTEXT_WARN_TOKENS ?? 12000);
const contextLimitTokens = Number(process.env.PI_MAX_CONTEXT_TOKENS ?? 20000);
const handoffFile = process.env.PI_HANDOFF_FILE ?? ".pi-handoff.md";
const handoffSender = process.env.PI_HANDOFF_SENDER ?? "Pi coding agent";

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
  let finalRequestPrepared = false;
  let finalRequestStarted = false;
  let handoffBefore: string | undefined;

  const requestCapReason = () => {
    if (sessionLimit > 0 && session.requests >= sessionLimit) return `session request cap (${sessionLimit})`;
    if (taskLimit > 0 && task.requests >= taskLimit) return `task request cap (${taskLimit})`;
    return "";
  };

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
    finalRequestPrepared = false;
    finalRequestStarted = false;
    handoffBefore = undefined;
  });

  pi.on("context", (event, ctx) => {
    const reason = requestCapReason();
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    if (!reserveFinalRequest || finalRequestPrepared || !reason) return;
    if (contextLimitTokens > 0 && contextTokens >= contextLimitTokens) return;

    finalRequestPrepared = true;
    handoffBefore = existsSync(handoffFile) ? readFileSync(handoffFile, "utf8") : undefined;
    const created = new Date().toISOString();
    const instruction = `FINALIZATION REQUEST (${reason}). This is the only extra provider request and no provider continuation will run after it. Do not start new work. If every explicit acceptance criterion is satisfied, give the normal concise completion answer now and do not touch the handoff file. Otherwise, use the write tool as your only action to overwrite ${handoffFile} with a self-contained Markdown handoff of at most 250 words. It must begin with "# Pi handoff", "Sender: ${handoffSender}", and "Created: ${created}", then state the objective, completed work, remaining acceptance criteria, changed files, verification results or failure, and the exact next step. Never include secrets or full logs.`;

    return {
      messages: [...event.messages, { role: "user", content: instruction, timestamp: Date.now() }],
    };
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
    const requestReason = requestCapReason();
    if (contextLimitTokens > 0 && contextTokens >= contextLimitTokens) {
      cappedReason = `context cap (${contextTokens}/${contextLimitTokens} tokens)`;
    } else if (requestReason && finalRequestPrepared && !finalRequestStarted) {
      finalRequestStarted = true;
      if (ctx.hasUI) ctx.ui.notify(`Final request: finish now or write the local handoff.`, "warning");
      return;
    } else if (requestReason) {
      cappedReason = requestReason;
    }
    if (cappedReason) {
      if (ctx.hasUI) ctx.ui.notify(`Stopped before another AI request: ${cappedReason}. Use /new to continue.`, "warning");
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
    if (finalRequestStarted) {
      const handoffAfter = existsSync(handoffFile) ? readFileSync(handoffFile, "utf8") : undefined;
      if (handoffAfter !== undefined && handoffAfter !== handoffBefore) {
        ctx.ui.notify(`Local handoff saved: ${handoffFile}`, "warning");
      } else if (!cappedReason) {
        ctx.ui.notify(`Final request completed without a new handoff file.`, "info");
      }
    }
    const taskCost = task.cost ? `€${task.cost.toFixed(4)}` : "unpriced";
    const sessionCost = session.cost ? `€${session.cost.toFixed(4)}` : "unpriced";
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    ctx.ui.notify(
      `Task ${task.requests}${taskLimit ? `/${taskLimit}${finalRequestStarted ? "+1 final" : ""}` : ""} req · ${task.input} input + ${task.cache} cached + ${task.output} output · ${taskCost} | Session ${session.requests}${sessionLimit ? `/${sessionLimit}${finalRequestStarted ? "+1 final" : ""}` : ""} req · ${sessionCost} · ctx ${contextTokens}`,
      cappedReason ? "warning" : "info",
    );
  });
}
