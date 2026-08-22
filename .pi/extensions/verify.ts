import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const command = process.env.PI_VERIFY_CMD;

export default function (pi: ExtensionAPI) {
  if (!command) return;
  pi.on("agent_settled", (_event, ctx) => {
    const result = spawnSync(command, {
      cwd: ctx.cwd,
      encoding: "utf8",
      shell: true,
      timeout: 120_000,
    });
    const passed = !result.error && result.status === 0;
    const detail = result.error ? result.error.message : `exit ${result.status ?? "unknown"}`;
    ctx.ui.notify(passed ? `Verified: ${command}` : `Verification failed (${detail}): ${command}`, passed ? "info" : "error");
  });
}
