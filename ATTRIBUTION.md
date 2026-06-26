# Attribution

## OpenSpec (foundation)

mzspec is a layer **on top of** [OpenSpec](https://github.com/Fission-AI/OpenSpec)
(`@fission-ai/openspec`, MIT). OpenSpec provides the spec artifact model (`openspec/specs`,
`openspec/changes`, the archive), the `openspec` CLI, and the base `/opsx:propose|sync|archive`
commands. mzspec adds the gated ship pipeline and quality-gate engine around those same artifacts and
does not fork or vendor OpenSpec — it expects OpenSpec to be installed in the consuming project.

## Engineering-practice skills

The skills under `core/skills/` (core pipeline skills) and `extensions/agent-skills/Skills/` are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, © Addy Osmani and
contributors). See [extensions/agent-skills/Skills/ATTRIBUTION.md](extensions/agent-skills/Skills/ATTRIBUTION.md) for the full
list. This adaptation retains the MIT terms.

## Origin

The pipeline and gate-resolver were extracted from the Mezon Mentor Bot ("MeKnow") platform, whose
configuration is preserved as the reference example under `examples/meknow/`.
