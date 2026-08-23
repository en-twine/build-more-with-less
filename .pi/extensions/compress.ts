import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function compressRepeatedLines(text: string): { text: string; saved: number } {
  const lines = text.split("\n");
  if (lines.length < 25) return { text, saved: 0 };

  const output: string[] = [];
  for (let i = 0; i < lines.length;) {
    let end = i + 1;
    while (end < lines.length && lines[end] === lines[i]) end += 1;
    const count = end - i;
    if (lines[i] && count >= 3) output.push(`${lines[i]}  ⟨×${count} identical lines⟩`);
    else output.push(...lines.slice(i, end));
    i = end;
  }

  const compressed = output.join("\n");
  return compressed.length < text.length ? { text: compressed, saved: text.length - compressed.length } : { text, saved: 0 };
}

export function capBashOutput(text: string, limit: number): { text: string; saved: number } {
  if (text.length <= limit) return { text, saved: 0 };
  const marker = "\n… ⟨middle of bash output removed locally⟩ …\n";
  const available = limit - marker.length;
  const head = Math.floor(available / 4);
  const tail = available - head;
  return {
    text: text.slice(0, head) + marker + text.slice(-tail),
    saved: text.length - limit,
  };
}

export default function (pi: ExtensionAPI) {
  let saved = 0;
  const maxChars = Number(process.env.PI_MAX_BASH_OUTPUT_CHARS ?? 8000);

  pi.on("input", (event) => {
    if (!event.streamingBehavior) saved = 0;
  });

  pi.on("tool_result", (event) => {
    if (event.toolName !== "bash") return;
    let changed = false;
    const content = event.content.map((block) => {
      if (block.type !== "text") return block;
      const compressed = compressRepeatedLines(block.text);
      const capped = capBashOutput(compressed.text, maxChars);
      saved += compressed.saved + capped.saved;
      changed ||= compressed.saved > 0 || capped.saved > 0;
      return compressed.saved || capped.saved ? { ...block, text: capped.text } : block;
    });
    if (changed) return { content };
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (saved && ctx.hasUI) ctx.ui.notify(`Deterministic log compression saved ${saved} characters`, "info");
  });
}
