# Build More with Less

Minimal local Pi harness for the Sustainable AI Hackathon. It uses no project dependencies or server.

## Setup

Install the tested Pi version and set the API key named in `harness.config.mjs`:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
export GREENPT_API_KEY="your-key"
node pi.mjs
```

Windows PowerShell:

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
$env:GREENPT_API_KEY="your-key"
node .\pi.mjs
```

Do not put a real key in `harness.config.mjs` or commit an `.env` file. The default tool set is `read,write,edit,bash`.

## Build in another repository

Keep this harness separate from the application you build. Set `workspacePath` in `harness.config.mjs` to that application's directory:

```js
workspacePath: "../hackathon-app",
```

Relative paths start at this harness repository. Absolute paths also work. For a temporary target without editing the config:

```sh
PI_WORKSPACE=/absolute/path/to/hackathon-app node pi.mjs
```

Windows PowerShell:

```powershell
$env:PI_WORKSPACE="C:\path\to\hackathon-app"
node .\pi.mjs
```

Pi refuses to start if the target is missing or is not a directory. Its file tools, shell commands, browser workflow, and verification command then operate from the application repository; harness state remains here.

## Event configuration

Edit only `harness.config.mjs`: application workspace, endpoint, model, API-key environment-variable name, compression mode, browser, orchestration, verification command, and token/request ceilings are together there.

Use `compression: "model"` when the event offers a Honey model. If it only offers an ordinary model, select that model and set `compression: "skill"` to load the vendored Honey Lean fallback. Use `"none"` only when intentionally running without compression.

Pi refuses to combine the fallback with any Honey, Ponytail, or Caveman model ID, preventing duplicate compression prompts. The fallback is GreenPT's official [Honey Lean](https://github.com/Green-PT/honey-for-devs/blob/c4e6839cc5217486c3d8fabbcda8bc5443ecb6b0/bench/variants/honey-lean.md) ruleset under the MIT license; it remains unloaded and costs no prompt tokens unless enabled.

The same config controls browser access, deterministic tool-output compression, the local verification command, the provider-request ceiling, and the maximum output size. Tool compression only collapses three or more consecutive byte-identical lines in long bash logs and preserves their count; it never rewrites prompts, requirements, source code, paths, commands, or error text. Pi computes its request/token/cost receipt locally from response metadata and only shows it in the terminal; it is never added to model context.

Set `verifyCommand: "npm test"` once the blueprint's test command is known. Pi runs it locally after each task and shows only pass/fail in the terminal; it adds no model request or context.

Browser interaction requires `browser-harness` on `PATH`. Set `browser: true` only when an acceptance criterion needs it; disabled mode does not load its tool schema. `PI_BROWSER_HARNESS` remains available for a non-standard executable path.

Orchestration is off by default because the single Pi loop completed the tested build without it. Set `orchestration: true` only when you explicitly want one additional scout, worker, or reviewer. The parent may delegate once per task; the child is sequential, isolated from the parent's conversation, capped by `orchestrationMaxRequests`, and its usage is included in the local receipt. There is no fan-out, background coordinator, shared server, or cmux/wmux dependency. cmux and wmux only display the parent Pi terminal.

Environment variables (`PI_WORKSPACE`, `HACKATHON_BASE_URL`, `HACKATHON_MODEL`, `HACKATHON_API_KEY`, `PI_HONEY_SKILL`, `PI_BROWSER`, `PI_ORCHESTRATION`, `PI_VERIFY_CMD`, `PI_MAX_TURNS`, and `PI_MAX_OUTPUT_TOKENS`) still override matching settings for temporary runs.

Before the event, delete `.setup/`. The retained competition harness is `.pi/`, `harness.config.mjs`, `pi.mjs`, and this file.
