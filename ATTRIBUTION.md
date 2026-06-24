# Attribution

## OpenSpec (foundation)

mzspec is a layer **on top of** [OpenSpec](https://github.com/Fission-AI/OpenSpec)
(`@fission-ai/openspec`, MIT). OpenSpec provides the spec artifact model (`openspec/specs`,
`openspec/changes`, the archive), the `openspec` CLI, and the base `/opsx:propose|apply|sync|archive`
commands. mzspec adds the gated ship pipeline and quality-gate engine around those same artifacts and
does not fork or vendor OpenSpec — it expects OpenSpec to be installed in the consuming project.

## Engineering-practice skills

The skills under `extensions/skills/` are adapted from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, © Addy Osmani and
contributors). See [extensions/skills/ATTRIBUTION.md](extensions/skills/ATTRIBUTION.md) for the full
list. This adaptation retains the MIT terms.

## Origin

The pipeline and gate-resolver were extracted from the Mezon Mentor Bot ("MeKnow") platform, whose
configuration is preserved as the reference example under `examples/meknow/`.
