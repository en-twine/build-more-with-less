---
name: build-more-with-less
description: Build a supplied application blueprint with the fewest AI requests, prompt tokens, output tokens, dependencies, and infrastructure while satisfying every explicit acceptance criterion. Use for the Build More with Less AI hackathon and comparable constrained application builds.
---

# Build More With Less

1. Work only on the current requested outcome. Read its blueprint, supplied tests, and relevant paths once without restating or rediscovering them.
2. Make the smallest verifiable change that preserves required validation, security, accessibility, and error handling. Split large artifacts by file or bounded edit.
3. Do not add dependencies, refactor unrelated code, research broadly, or implement speculative features unless an acceptance criterion requires it.
4. Never weaken supplied tests. After meaningful changes, run the narrowest deterministic check; use the browser only for behavior it cannot prove.
5. Repair observed failures only. Never repeat the same failed approach more than twice; then stop and report the observed blocker.
6. Stop immediately when the acceptance criteria pass. A green vertical slice ends the session; use `/new` before unrelated work.
7. Keep user-facing responses to at most three short bullets and omit progress narration. Call `save_handoff` only when the user explicitly requests it.
