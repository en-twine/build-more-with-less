---
name: lca-challenge
description: Implement and verify the supplied Simplified LCA Comparison Tool challenge from its JSON fixtures while preserving the event's calculation, validation, persistence, and comparison requirements.
---

# LCA Challenge

1. Treat the supplied brief and both schema `1.0` JSON files as acceptance fixtures; do not invent fields or external services.
2. Calculate each flow as `quantity × emission factor`, sum by stage and product, then **multiply** product totals by `functional_unit_scaling_factor`. The brief's divide sentence conflicts with the JSON notes and official demo, which use multiplication.
3. Reject malformed structure, duplicate factor IDs, unknown material references, unit mismatches, and non-finite or negative quantities/factors. Keep regional variants distinct by ID and group them by name in the UI; never delete a factor while flows reference it.
4. Persist all editable factors, products, ordered user-named stages, and flows locally. Recalculate immediately after edits and support both imports plus manual product creation; do not hard-code the primer's four stage names.
5. Compare GWP, eutrophication, and water independently; lower is better and there is no overall winner. Keep order-of-magnitude differences legible.
6. Prove calculations, validation, editing, persistence, and required CRUD with deterministic tests near 80% generated-source coverage. Stop when the stated requirements pass.
