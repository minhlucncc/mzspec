# Gate plugin contract

A **gate** is the smallest unit of verification mzspec knows how to run. mzspec ships the
*resolver* (which gates run for a given diff) and the *runner convention*; **the gate scripts
themselves are owned by your project**. This file is the contract a gate must satisfy so the
ship pipeline can run it uniformly.

## The contract

A gate is any executable (shell, Python, Go, a binary — anything) that obeys:

1. **Exit code is the verdict.** `0` = pass, non-zero = fail. Nothing else is inspected to
   decide pass/fail.
2. **Working directory is the repo root.** Gates are invoked from the top of the consuming
   repo. Resolve all paths repo-relative; never `cd` elsewhere and assume it sticks.
3. **Arguments are positional and optional.** A gate may take args (e.g. a threshold:
   `faithfulness-gte.sh 0.85`, or a target dir: `pytest-passes.sh packages/foo`). Wire the exact
   invocation in `customGates[].cmd` in `mzspec.config.json`.
4. **Diagnostics go to stderr; a one-line `ok:`/`fail:` summary may go to stdout.** Keep stdout
   quiet on success so evidence tables stay readable.
5. **Deterministic and side-effect-free** (beyond reading the repo / hitting a configured test
   DB). A gate must be safe to run repeatedly.
6. **Self-skipping when a dependency is absent** is allowed (e.g. exit 0 with a `skip:` note if
   `TEST_DATABASE_URL` is unset) — but document it.

## How a project registers gates

Two mechanisms, both config-only (no edits to mzspec):

- **Toolchain-native gates** — the lint/typecheck/test commands per toolchain live under
  `toolchains.<tc>.gates`. `{dir}` is substituted with the touched package directory. These run
  automatically for any touched package of that toolchain.
- **Custom project gates** — drop your scripts under `gatesDir` (e.g. `benchmarks/gates/`) and
  register each in `customGates`:

  ```jsonc
  "customGates": [
    { "name": "acl",        "cmd": "bash benchmarks/gates/retrieve-kb-acl-test.sh", "when": { "toolchains": ["py"] } },
    { "name": "free-ladder","cmd": "bash benchmarks/ci-free-gates.sh",              "when": { "touchesBench": true } },
    { "name": "migration",  "cmd": "uv --directory apps/backend run alembic upgrade head", "when": { "touchesMigrations": true } }
  ]
  ```

  `when` predicates (all optional; all must hold): `touches` (a path prefix present in the diff),
  `touchesMigrations`, `touchesBench`, `toolchains` (at least one present). An empty/absent `when`
  means *always*.

## Starter gates

`extensions/gates/starters/` ships a couple of generic, project-agnostic gates you can keep or
delete:

- `openspec-validate.sh` — `openspec validate "<change>" --strict` (usually already wired as an
  always-gate).
- `toolchain-passthrough.sh` — a thin example showing the exit-code/stderr convention.

Your project's real gates (the equivalent of MeKnow's 46) live in *your* repo under `gatesDir`,
not here. mzspec deliberately does not vendor project-specific gates.
