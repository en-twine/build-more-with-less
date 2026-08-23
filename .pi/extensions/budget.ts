import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const taskLimit = Number(process.env.PI_MAX_TURNS ?? 6);
const sessionLimit = Number(process.env.PI_MAX_SESSION_REQUESTS ?? 12);
const reserveFinalRequest = process.env.PI_RESERVE_FINAL_REQUEST !== "0";
const contextWarnTokens = Number(process.env.PI_CONTEXT_WARN_TOKENS ?? 12000);
const contextLimitTokens = Number(process.env.PI_MAX_CONTEXT_TOKENS ?? 20000);
const handoffFile = process.env.PI_HANDOFF_FILE ?? ".pi-handoff.md";
const handoffSender = process.env.PI_HANDOFF_SENDER ?? "Pi coding agent";
const handoffParameters = {
  type: "object",
  properties: {
    objective: { type: "string", description: "The task objective." },
    completed: { type: "string", description: "Completed work and relevant changed files, or 'None'." },
    remaining: { type: "string", description: "Unmet acceptance criteria or blocker." },
    verification: { type: "string", description: "Checks run and their results, or 'Not run'." },
    nextStep: { type: "string", description: "One exact next action for the next session." },
  },
  required: ["objective", "completed", "remaining", "verification", "nextStep"],
  additionalProperties: false,
} as const;

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
  let toolsBeforeFinal: string[] | undefined;
  let finalInstruction = "";

  const restoreTools = () => {
    if (!toolsBeforeFinal) return;
    pi.setActiveTools(toolsBeforeFinal);
    toolsBeforeFinal = undefined;
  };

  const prepareFinalRequest = (ctx: ExtensionContext) => {
    const reason = requestCapReason();
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    if (!reserveFinalRequest || finalRequestPrepared || !reason) return;
    if (contextLimitTokens > 0 && contextTokens >= contextLimitTokens) return;

    finalRequestPrepared = true;
    handoffBefore = existsSync(handoffFile) ? readFileSync(handoffFile, "utf8") : undefined;
    const created = new Date().toISOString();
    finalInstruction = `FINALIZATION REQUEST (${reason}, prepared ${created}). This is the only extra provider request and no provider continuation will run after it. Application tools are now unavailable: do not start or continue implementation. If every explicit acceptance criterion was already satisfied before this request, give the normal concise completion answer and do not create a handoff. Otherwise call save_handoff exactly once with a self-contained status of at most 250 words. Never include secrets or full logs.`;
  };

  const requestCapReason = () => {
    if (sessionLimit > 0 && session.requests >= sessionLimit) return `session request cap (${sessionLimit})`;
    if (taskLimit > 0 && task.requests >= taskLimit) return `task request cap (${taskLimit})`;
    return "";
  };

  pi.on("session_start", (_event, ctx) => {
    const activeTools = pi.getActiveTools();
    if (activeTools.includes("save_handoff")) {
      pi.setActiveTools(activeTools.filter((name) => name !== "save_handoff"));
    }
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
    restoreTools();
    task = emptyMeter();
    cappedReason = "";
    finalRequestPrepared = false;
    finalRequestStarted = false;
    handoffBefore = undefined;
    finalInstruction = "";
  });

  pi.on("before_agent_start", (_event, ctx) => prepareFinalRequest(ctx));

  pi.registerCommand("pickup", {
    description: "Continue the single private local handoff in one request",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Pi is busy; run /pickup when it is idle.", "warning");
        return;
      }
      if (!existsSync(handoffFile)) {
        ctx.ui.notify(`No local handoff found: ${handoffFile}`, "warning");
        return;
      }
      const handoff = readFileSync(handoffFile, "utf8").trim();
      ctx.ui.notify(`Loaded local handoff: ${handoffFile}`, "info");
      pi.sendUserMessage(`Continue this local handoff in the current workspace. Execute only its remaining work, verify it, and finish without restating the handoff.\n\n${handoff}`);
    },
  });

  pi.registerTool({
    name: "save_handoff",
    label: "Save local handoff",
    description: "Overwrite the single private local handoff for an unfinished capped task. Include only concise durable state; never include secrets or full logs.",
    parameters: handoffParameters as any,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const document = [
        "# Pi handoff",
        `Sender: ${handoffSender}`,
        `Created: ${new Date().toISOString()}`,
        `Workspace: ${ctx.cwd}`,
        "",
        "## Objective",
        params.objective.trim(),
        "",
        "## Completed",
        params.completed.trim(),
        "",
        "## Remaining",
        params.remaining.trim(),
        "",
        "## Verification",
        params.verification.trim(),
        "",
        "## Next step",
        params.nextStep.trim(),
        "",
      ].join("\n");
      writeFileSync(handoffFile, document, { encoding: "utf8", mode: 0o600 });
      chmodSync(handoffFile, 0o600);
      return { content: [{ type: "text", text: `Saved private local handoff: ${handoffFile}` }] };
    },
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const usage = event.message.usage;
    if (!usage.totalTokens) return;
    task.requests += 1;
    session.requests += 1;
    addUsage(task, usage);
    addUsage(session, usage);
    prepareFinalRequest(ctx);
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

  pi.on("before_provider_request", (event, ctx) => {
    const contextTokens = ctx.getContextUsage()?.tokens ?? 0;
    const requestReason = requestCapReason();
    if (contextLimitTokens > 0 && contextTokens >= contextLimitTokens) {
      cappedReason = `context cap (${contextTokens}/${contextLimitTokens} tokens)`;
    } else if (requestReason && finalRequestPrepared && !finalRequestStarted) {
      finalRequestStarted = true;
      toolsBeforeFinal = pi.getActiveTools();
      pi.setActiveTools(["save_handoff"]);
      if (ctx.hasUI) ctx.ui.notify(`Final request: finish now or write the local handoff.`, "warning");
      const payload = event.payload as { messages?: unknown[]; [key: string]: unknown };
      if (!Array.isArray(payload.messages)) {
        cappedReason = "unsupported provider payload for final handoff";
      } else {
        return {
          ...payload,
          messages: [...payload.messages, { role: "user", content: finalInstruction }],
          tools: [{
            type: "function",
            function: {
              name: "save_handoff",
              description: "Save the private local handoff for this unfinished capped task.",
              parameters: handoffParameters,
            },
          }],
          tool_choice: "auto",
        };
      }
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
    restoreTools();
  });
}
