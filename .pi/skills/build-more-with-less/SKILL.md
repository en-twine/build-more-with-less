---
name: build-more-with-less
description: Build a supplied application blueprint with the fewest AI requests, prompt tokens, output tokens, dependencies, and infrastructure while satisfying every explicit acceptance criterion. Use for the Build More with Less AI hackathon and comparable constrained application builds.
---

# Build More With Less

1. Read the blueprint and supplied tests once; track criteria without restating them.
2. Use supplied paths and bounded, batched reads; do not rediscover unchanged context.
3. Build the smallest complete slice while preserving required validation, security, accessibility, and error handling.
4. Never weaken supplied tests. Run the narrowest deterministic checks; use the browser only for behavior they cannot prove.
5. Repair only observed failures, stop when green, and report status plus verification commands in at most three bullets.
