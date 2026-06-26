# Attribution

## OpenSpec (artifact model)

mzspec reuses the **artifact model** from [OpenSpec](https://github.com/Fission-AI/OpenSpec)
(`openspec/specs`, `openspec/changes`, the archive). The pipeline functionality
(`validate`, `status`, `list`, `new`, `archive`, `init`) is reimplemented natively in
`lib/openspec.js` — no external OpenSpec CLI dependency is required.

## Engineering-practice skills

The skills under `core/skills/` (core pipeline skills) and `extensions/agent-skills/Skills/` are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, © Addy Osmani and
contributors). See [extensions/agent-skills/Skills/ATTRIBUTION.md](extensions/agent-skills/Skills/ATTRIBUTION.md) for the full
list. This adaptation retains the MIT terms.

## Origin

The pipeline and gate-resolver were extracted from the Mezon Mentor Bot ("MeKnow") platform.
