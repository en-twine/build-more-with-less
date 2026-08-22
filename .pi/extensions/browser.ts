import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const actions = ["open", "inspect", "click", "fill", "key", "close"] as const;

function py(value: unknown): string {
  return JSON.stringify(value);
}

async function runHarness(script: string, signal?: AbortSignal): Promise<string> {
  const command = process.env.PI_BROWSER_HARNESS || "browser-harness";
  const { stdout } = await execFileAsync(command, ["-c", script], {
    env: { ...process.env, BH_DOMAIN_SKILLS: "0" },
    maxBuffer: 1_000_000,
    timeout: 20_000,
    signal,
  });
  return stdout.trim().slice(-8_000);
}

const browserTool = defineTool({
  name: "browser",
  label: "Browser",
  description: "Open and inspect a local web app, then click, fill, press a key, or close the controlled tab. Use only for a specific acceptance check.",
  parameters: Type.Object({
    action: StringEnum(actions),
    url: Type.Optional(Type.String()),
    x: Type.Optional(Type.Number()),
    y: Type.Optional(Type.Number()),
    selector: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    key: Type.Optional(Type.String()),
  }),
  async execute(_id, params, signal) {
    let script: string;
    if (params.action === "open") {
      if (!params.url || !/^https?:\/\//i.test(params.url)) throw new Error("browser.open requires an http(s) URL");
      script = `import json; new_tab(${py(params.url)}); wait_for_load(); print(json.dumps(page_info()))`;
    } else if (params.action === "inspect") {
      const expression = `(()=>{const visible=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=="hidden"};const controls=[...document.querySelectorAll("a,button,input,select,textarea,[role=button]")].filter(visible).slice(0,40).map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName.toLowerCase(),text:(e.innerText||e.value||"").trim().slice(0,120),aria:e.getAttribute("aria-label")||"",name:e.getAttribute("name")||"",id:e.id||"",x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}});return{text:(document.body?.innerText||"").slice(0,4000),controls}})()`;
      script = `import json; ensure_real_tab(); print(json.dumps({"page":page_info(),"content":js(${py(expression)})}, ensure_ascii=False))`;
    } else if (params.action === "click") {
      if (params.x === undefined || params.y === undefined) throw new Error("browser.click requires x and y from inspect");
      script = `import json; click_at_xy(${params.x},${params.y}); print(json.dumps(page_info()))`;
    } else if (params.action === "fill") {
      if (!params.selector || params.text === undefined) throw new Error("browser.fill requires selector and text");
      script = `import json; fill_input(${py(params.selector)},${py(params.text)}); print(json.dumps(page_info()))`;
    } else if (params.action === "key") {
      if (!params.key) throw new Error("browser.key requires key");
      script = `import json; press_key(${py(params.key)}); print(json.dumps(page_info()))`;
    } else {
      script = `import json; t=current_tab(); print(json.dumps(cdp("Target.closeTarget", targetId=t["targetId"])))`;
    }

    try {
      const output = await runHarness(script, signal);
      return { content: [{ type: "text", text: output || "ok" }], details: { action: params.action } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Browser unavailable: ${message.slice(0, 500)}`);
    }
  },
});

export default function (pi: ExtensionAPI) {
  if (process.env.PI_BROWSER === "1") pi.registerTool(browserTool);
}
