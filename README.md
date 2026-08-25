# Build More with Less

Minimal local Pi harness for the Sustainable AI Hackathon. It uses no project dependencies or server.

## Setup

Create your ignored local configuration and `.env`, then install the tested Pi version:

```sh
cp harness.config.example.mjs harness.config.mjs
cp .env.example .env
# Add both event API keys to .env.
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
node pi.mjs
```

Windows PowerShell:

```powershell
Copy-Item .\harness.config.example.mjs .\harness.config.mjs
Copy-Item .\.env.example .\.env
# Add both event API keys to .env.
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
node .\pi.mjs
```

The ignored `.env` holds `HACKATHON_API_KEY_1` and `HACKATHON_API_KEY_2`; `keySlot` in `harness.config.mjs` selects one without exposing either value. On every launch, `node pi.mjs` automatically loads `.env`; a `HACKATHON_API_KEY` explicitly exported in the terminal is a temporary override. The harness config is also ignored so every user keeps their workspace and run switches locally. Commit only changes to `harness.config.example.mjs`, and never put a real key in either config file or commit `.env`. The default tool set is `read,write,edit,bash`.

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

Edit only `harness.config.mjs`. Set `teamNumber` once, increment `runId` for each measured or test run, choose API key `keySlot` 1 or 2, and select `modelProfile`:

- `deepseek-honey` uses `yoink@openailike/deepseek-v4-flash-0731` plus the vendored Honey Lean skill. This is the recommended first run: event pricing is $0.14/M input and $0.35/M output.
- `glm-caveman` uses the supplied `yoink@openailike/glm-5.2-caveman` compression model without Honey. Use it for a second run if DeepSeek leaves a material quality gap; it costs $1.10/M input and $4.40/M output.

The harness sends `X-ORQ-IDENTITY-ID: team-X-run-Y` on every provider request and refuses the placeholder `team-X`. The endpoint is fixed to `https://my.orq.ai/v3/router`. `HACKATHON_IDENTITY_ID`, `HACKATHON_MODEL`, and an explicitly exported `HACKATHON_API_KEY` remain temporary overrides.

Use `compression: "model"` when the event offers a Honey model. If it only offers an ordinary model, select that model and set `compression: "skill"` to load the vendored Honey Lean fallback. Use `"none"` only when intentionally running without compression.

Pi refuses to combine the fallback with any Honey, Ponytail, or Caveman model ID, preventing duplicate compression prompts. The fallback is GreenPT's official [Honey Lean](https://github.com/Green-PT/honey-for-devs/blob/c4e6839cc5217486c3d8fabbcda8bc5443ecb6b0/bench/variants/honey-lean.md) ruleset under the MIT license; it is loaded for the DeepSeek profile and remains unloaded for Caveman. No locally recreated Ponytail or Caveman prompt is needed.

The tiny LCA challenge skill is always loaded. It records only non-obvious invariants from the supplied files, especially that normalized totals are multiplied by `functional_unit_scaling_factor`; the brief's divide sentence conflicts with both JSON notes and the official demo results.

For every scored or comparison run:

1. Create a fresh empty application folder and point `workspacePath` to it; do not reuse a previous generated application.
2. Keep the supplied brief and both JSON fixtures outside that folder and reference their paths in the first prompt.
3. Increment `runId`, choose `keySlot`, and start with `modelProfile: "deepseek-honey"`.
4. Keep orchestration off. Enable the browser only for final behavior that deterministic tests cannot prove.
5. Start Pi and give one outcome-oriented prompt with the brief/data paths and required test command; let the injected skills carry the repeated constraints.

The same config controls browser access, deterministic tool-output compression, the local verification command, optional request/context ceilings, and maximum output sizes. Normal parent work has no request or hard-context cap; bounded subagents retain their separate limit. Tool compression collapses three or more consecutive byte-identical lines and bounds long bash output while preserving its start and error-heavy tail; it never rewrites prompts, requirements, source code, paths, commands, or error text. Pi computes task and cumulative-session request/token/cost receipts locally from response metadata and only shows them in the terminal; they are never added to model context.

`verifyCommand` runs an existing test command; it does not create tests. If the blueprint or scaffold supplies tests, use its command, such as `verifyCommand: "npm test"`. Otherwise, ask Pi to add the smallest deterministic test that proves the current acceptance criteria in the same slice. A dependency-free JavaScript application can use Node's built-in runner with `verifyCommand: "node --test"`; use the framework's existing test command when one is available. Keep visual styling checks in the browser instead of creating fragile pixel tests.

Pi runs the command locally after each task and shows only pass/fail in the terminal, adding no model request or context. A concise implementation prompt is: `Build the feature and add the smallest dependency-free test covering the acceptance criteria. Run node --test and stop when green.`

Browser interaction requires `browser-harness` on `PATH`. Set `browser: true` only when an acceptance criterion needs it; disabled mode does not load its tool schema. `PI_BROWSER_HARNESS` remains available for a non-standard executable path.

Orchestration must remain off during a scored run because the event rules prohibit delegation to other AIs. The retained switch is for non-scored harness development only. There is no background coordinator, shared server, or cmux/wmux dependency.

Environment variables (`PI_WORKSPACE`, `HACKATHON_BASE_URL`, `HACKATHON_MODEL`, `HACKATHON_API_KEY`, `HACKATHON_IDENTITY_ID`, `PI_HONEY_SKILL`, `PI_BROWSER`, `PI_ORCHESTRATION`, `PI_VERIFY_CMD`, `PI_MAX_TURNS`, `PI_MAX_SESSION_REQUESTS`, `PI_RESERVE_FINAL_REQUEST`, `PI_CONTEXT_WARN_TOKENS`, `PI_MAX_CONTEXT_TOKENS`, `PI_MAX_BASH_OUTPUT_CHARS`, and `PI_MAX_OUTPUT_TOKENS`) still override matching settings for temporary runs.

## How to work with the harness

Treat the repository, blueprint, backlog, tests, and git diff as durable memory. Treat the conversation as temporary working memory.

1. Put the supplied blueprint and tests in the application repository. Set `workspacePath` and `verifyCommand`, then give Pi one backlog item with its exact acceptance criteria and test command. Reference file paths instead of pasting their contents repeatedly.
2. Keep one Pi session per vertical slice or backlog item. Continue only for one or two direct repairs based on an observed failure. When tests are green, the goal changes, or the context warning appears, type `/new` before the next item. Do not use `--continue` for unrelated work.
3. Keep the dev server and routine tests in separate cmux/wmux panes so their output never enters AI context. Inside Pi, `!!npm test` runs locally without sending output to the model; use `!npm test` only when the model genuinely needs that output. Share only the failing assertion and relevant path, not an entire log.
4. Let deterministic tests decide completion. Ask for one verifiable slice at a time. Split large artifacts by file or bounded edit, keep answers short, and do not request progress summaries, repeated plans, broad re-reviews, or speculative improvements. Stop when the explicit criteria pass.
5. Leave orchestration and browser access off for normal work. Enable one scout or worker only when stuck on a clearly bounded problem; use one reviewer before the demo only when independent checking is worth the extra requests. Prefer manual browser verification.
6. Prefer `/new` over compaction. Use `/compact Preserve only unmet acceptance criteria, modified files, the current failing test, key decisions, and the next command. Drop completed work and discussion.` only when a single unfinished item cannot be restarted cheaply and several more AI requests are expected.

For quick design direction, use [Refero Styles](https://styles.refero.design/?q=minimal) and choose one reference close to the intended interface. Do not paste a complete style guide into every prompt. Extract only the rules needed for the current slice—usually palette, typography, spacing, the key visual motif, and explicit do/don't constraints—and keep the full reference in the application repository when later tasks may need it. This preserves a coherent visual direction without repeatedly paying for irrelevant design context.

Normal parent work has no request-count ceiling. Scope is controlled by the injected behavior: one requested outcome, the smallest verifiable change, no speculative work, a maximum of two attempts at the same failed approach, and an immediate stop when the criteria pass. Output remains capped at 4,000 tokens. If a response ends at that limit, the harness blocks Pi's automatic retry without making another AI request or creating a handoff; send a smaller bounded instruction to continue.

The small `save_handoff` tool remains available but the skill permits it only when you explicitly request a handoff. It deterministically overwrites the single local `.pi-handoff.md` with its sender/model, timestamp, workspace, objective, completed and remaining work, verification state, and exact next step. The file lives in this harness repository, has user-only file permissions, is git-ignored, is never added to model context automatically, and is never shared. Its absolute path is shown locally when it is updated.

After an explicit handoff, type `/new` and then `/pickup`. The command reads the fixed handoff locally and sends its contents with the continuation request, avoiding a separate AI request to discover and read the file. Never ask the model to search for a handoff. Delete `.pi-handoff.md` locally once it is no longer useful.

The harness gives a local-only warning at 12,000 active context tokens but does not stop the conversation. Finish the current slice and use `/new` rather than carrying unrelated history. Pi's own auto-compaction remains an emergency fallback.

Before the event, delete `.setup/`. The retained competition harness is `.pi/`, the local `harness.config.mjs`, its tracked template, `pi.mjs`, and this file.
