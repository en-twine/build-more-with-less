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

The same config controls browser access, deterministic tool-output compression, the local verification command, per-task and per-session request ceilings, context thresholds, and maximum output sizes. Tool compression collapses three or more consecutive byte-identical lines and bounds long bash output while preserving its start and error-heavy tail; it never rewrites prompts, requirements, source code, paths, commands, or error text. Pi computes task and cumulative-session request/token/cost receipts locally from response metadata and only shows them in the terminal; they are never added to model context.

Set `verifyCommand: "npm test"` once the blueprint's test command is known. Pi runs it locally after each task and shows only pass/fail in the terminal; it adds no model request or context.

Browser interaction requires `browser-harness` on `PATH`. Set `browser: true` only when an acceptance criterion needs it; disabled mode does not load its tool schema. `PI_BROWSER_HARNESS` remains available for a non-standard executable path.

Orchestration is off by default because the single Pi loop completed the tested build without it. Set `orchestration: true` only when you explicitly want one additional scout, worker, or reviewer. The parent may delegate once per task; the child is sequential, isolated from the parent's conversation, capped by `orchestrationMaxRequests`, and its usage is included in the local receipt. There is no fan-out, background coordinator, shared server, or cmux/wmux dependency. cmux and wmux only display the parent Pi terminal.

Environment variables (`PI_WORKSPACE`, `HACKATHON_BASE_URL`, `HACKATHON_MODEL`, `HACKATHON_API_KEY`, `PI_HONEY_SKILL`, `PI_BROWSER`, `PI_ORCHESTRATION`, `PI_VERIFY_CMD`, `PI_MAX_TURNS`, `PI_MAX_SESSION_REQUESTS`, `PI_CONTEXT_WARN_TOKENS`, `PI_MAX_CONTEXT_TOKENS`, `PI_MAX_BASH_OUTPUT_CHARS`, and `PI_MAX_OUTPUT_TOKENS`) still override matching settings for temporary runs.

## How to work with the harness

Treat the repository, blueprint, backlog, tests, and git diff as durable memory. Treat the conversation as temporary working memory.

1. Put the supplied blueprint and tests in the application repository. Set `workspacePath` and `verifyCommand`, then give Pi one backlog item with its exact acceptance criteria and test command. Reference file paths instead of pasting their contents repeatedly.
2. Keep one Pi session per vertical slice or backlog item. Continue only for one or two direct repairs based on an observed failure. When tests are green, the goal changes, or the context cutoff appears, type `/new` before the next item. Do not use `--continue` for unrelated work.
3. Keep the dev server and routine tests in separate cmux/wmux panes so their output never enters AI context. Inside Pi, `!!npm test` runs locally without sending output to the model; use `!npm test` only when the model genuinely needs that output. Share only the failing assertion and relevant path, not an entire log.
4. Let deterministic tests decide completion. Do not request progress summaries, repeated plans, broad re-reviews, or speculative improvements. Stop when the explicit criteria pass.
5. Leave orchestration and browser access off for normal work. Enable one scout or worker only when stuck on a clearly bounded problem; use one reviewer before the demo only when independent checking is worth the extra requests. Prefer manual browser verification.
6. Prefer `/new` over compaction. Use `/compact Preserve only unmet acceptance criteria, modified files, the current failing test, key decisions, and the next command. Drop completed work and discussion.` only when a single unfinished item cannot be restarted cheaply and several more AI requests are expected.

The default guards allow six provider requests per user task and twelve across the complete session, including delegated subagents. The harness warns at 12,000 active context tokens and stops before another request at 20,000. A stop is local and deterministic: start `/new`; it does not trigger an automatic summarization request. Pi's own auto-compaction remains an emergency fallback but should not be reached during normal competition work.

Before the event, delete `.setup/`. The retained competition harness is `.pi/`, `harness.config.mjs`, `pi.mjs`, and this file.
