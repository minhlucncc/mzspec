# Example: MeKnow (Mezon Mentor Bot platform)

The reference configuration this repo's design was extracted from — a polyglot
monorepo (Python uv workspace + Go 1.24 modules + a pnpm React portal) on the
spec-first, two-PR, remote-PR-gated OpenSpec lifecycle.

- `mzspec.config.json` — the full project config: the toolchain inventory + gate
  commands MeKnow hardcoded before extraction, plus its hard-invariants. The
  mzspec gate-resolver, driven by this file, emits a byte-identical gate plan to
  MeKnow's original hardcoded resolver.
- `gates/` — two representative project-owned gate scripts (`bot-policy-valid.sh`,
  `retrieve-kb-acl-test.sh`). The real project keeps ~46 such gates under its own
  `gatesDir` (`benchmarks/gates/`) and wires them via `customGates` — they are NOT
  vendored into mzspec.

Use this as a template: copy `mzspec.config.json` to your repo root, swap the
toolchain `dirs`/`gates` for yours, and point `gatesDir`/`customGates` at your
own gate scripts.
