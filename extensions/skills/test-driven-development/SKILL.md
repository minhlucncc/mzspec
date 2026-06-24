---
name: test-driven-development
description: Drives development with tests (MeKnow-adapted, polyglot + OpenSpec). Use when implementing any logic, fixing any bug, or changing any behavior in this repo. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality. Red-Green-Refactor with language-appropriate tests (pytest / table-driven Go / vitest), the resolver-selected gates, and the `/opsx:ship` Test(Red) phase.
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes, reproduce the bug with a test before attempting a fix. Tests are proof — "seems right" is not done. A codebase with good tests is an AI agent's superpower; a codebase without tests is a liability.

In the MeKnow platform this means: a failing test **in the touched package's language** first (`tests/test_<feature>.py` for Python, `<feature>_test.go` for Go, `apps/portal/src/**/<feature>.test.ts(x)` for TypeScript), then the minimal code to make it pass, then the resolver-selected gates (uv / go / pnpm as applicable + `ci-free-gates.sh` + `openspec validate`) to keep the tree green.

## When to Use

- Implementing any new logic or behavior
- Fixing any bug (the Prove-It Pattern)
- Modifying existing functionality
- Adding edge case handling
- Any change that could break existing behavior

**When NOT to use:** Pure configuration changes, documentation updates, or static content changes that have no behavioral impact.

**Related:** For multi-file work, combine TDD with the `incremental-implementation` skill (one thin slice, tested, then expand). For end-to-end behavior, exercise the real path — e.g. the deterministic benchmark ladder (`bash benchmarks/ci-free-gates.sh`) and the gate scripts under `benchmarks/gates/` that back spec scenarios (faithfulness >= 0.85, citation accuracy >= 0.95, p95 <= 12s, cross-tenant isolation, ACL escape).

## The TDD Cycle

```
    RED                GREEN              REFACTOR
 Write a test    Write minimal code    Clean up the
 that fails  ──→  to make it pass  ──→  implementation  ──→  (repeat)
      │                  │                    │
      ▼                  ▼                    ▼
   Test FAILS        Test PASSES       resolver gates PASS
```

### Step 1: RED — Write a Failing Test

Write the test first, in the language of the package you're touching. It must fail. A test that passes immediately proves nothing. Run the narrow test target and **confirm it fails**:

```bash
# Python (uv member dir D):
uv --directory packages/rag-core run python -m pytest -q tests/test_filter.py   # expect: FAIL
```

```python
# RED: This fails because the filter stage doesn't refuse on missing citations yet.
# packages/rag-core/tests/test_filter.py
import pytest
from rag_core.filter import filter_answer

@pytest.mark.parametrize(
    "name, answer, citations, want_refused",
    [
        ("grounded answer passes",       "Per the policy, X.", ["doc#3"], False),
        ("no citations is refused",      "X is true.",         [],        True),
        ("empty answer is refused",      "",                   [],        True),
    ],
)
def test_filter_refuses_when_no_citations(name, answer, citations, want_refused):
    result = filter_answer(answer=answer, citations=citations, tenant_id="t_acme")
    assert result.refused is want_refused, name
```

For Go, prefer a table-driven `<feature>_test.go`; for the portal, a vitest `*.test.ts(x)` beside the unit.

### Step 2: GREEN — Make It Pass

Write the minimum code to make the test pass. Don't over-engineer:

```python
# GREEN: Minimal implementation — only what the test demands.
# Honors the citations-mandatory invariant: refuse_if no_citations.
def filter_answer(*, answer: str, citations: list[str], tenant_id: str) -> FilterResult:
    if not answer.strip() or not citations:
        return FilterResult(refused=True, tenant_id=tenant_id)
    return FilterResult(refused=False, answer=answer, citations=citations, tenant_id=tenant_id)
```

Re-run the narrow test target and confirm it now PASSES.

### Step 3: REFACTOR — Clean Up

With the test green, improve the code without changing behavior:

- Extract shared logic
- Improve naming
- Remove duplication
- Optimize only if necessary

Then confirm the resolver-selected gates are still green. For a Python change in member dir `D`:

```bash
uv --directory D run ruff check .
uv --directory D run ruff format --check .
uv --directory D run pyright
uv --directory D run python -m pytest -q
bash benchmarks/ci-free-gates.sh          # on any py/bench change
openspec validate "<change>" --strict
```

(For a Go module dir `M`: `go build ./...`, `go vet ./...`, `go test -race ./...`. For `apps/portal`: `pnpm typecheck`, `pnpm lint`, `pnpm test`.)

Run the gates after every refactor step. (See the note on DB-dependent tests under "Verification" — a *skip* is not a failure.)

## The Prove-It Pattern (Bug Fixes)

When a bug is reported, **do not start by trying to fix it.** Start by writing a test that reproduces it.

```
Bug report arrives
       │
       ▼
  Write a test (in the touched package's language) that demonstrates the bug
       │
       ▼
  Run the narrow test target  →  FAILS (confirming the bug exists)
       │
       ▼
  Implement the fix
       │
       ▼
  Run the narrow test target  →  PASSES (proving the fix works)
       │
       ▼
  Resolver gates green (no regressions across the touched packages)
```

**Example:**

```python
# Bug: "retrieve_kb returns chunks from another tenant when the cache key collides."

# Step 1: Reproduction test — it should FAIL with current code.
# packages/rag-core/tests/test_retrieve_kb_acl.py
def test_retrieve_kb_never_crosses_tenant():
    seed_chunk(tenant_id="t_acme", doc="secret")
    seed_chunk(tenant_id="t_globex", doc="public")

    hits = retrieve_kb(query="secret", tenant_id="t_globex", acl=caller_acl("t_globex"))

    # fails → bug confirmed: a t_acme chunk leaks into the t_globex result
    assert all(h.tenant_id == "t_globex" for h in hits)
```

ACL is enforced **server-side inside `retrieve_kb`** and caller identity is inherited, never trusted from the model. The cache key must include `tenant_id` and an ACL-cohort hash — a reproduction test must respect that boundary. Versions are append-only, so a fix is a new child row with a parent pointer, never an in-place mutation.

## The Test Pyramid

Invest testing effort according to the pyramid — most tests should be small and fast, with progressively fewer tests at higher levels:

```
          ╱╲
         ╱  ╲         LLM-tier / E2E (~5%)  benchmark gates + portal Playwright
        ╱    ╲        Faithfulness/citation/latency thresholds; full retrieval flow
       ╱──────╲
      ╱        ╲      Integration (~15%)
     ╱          ╲     pytest against a pgvector DB; Go module integration; vitest+API
    ╱────────────╲
   ╱              ╲   Unit (~80%)
  ╱                ╲  Pure logic: filter/cite/synthesize stages, policy interpreter, parsers
 ╱──────────────────╲
```

**The Beyonce Rule:** If you liked it, you should have put a test on it. Refactors and migrations are not responsible for catching your bugs — your tests are. If a change breaks your code and you didn't have a test for it, that's on you.

### Test Sizes (Resource Model)

| Size | Constraints | Speed | Example in MeKnow |
|------|------------|-------|-------------------|
| **Small** | Single process, no I/O, no network, no DB | Milliseconds | `filter`/`cite` stage logic, BotPolicy parsing, prompt builders |
| **Medium** | Localhost only, no external services | Seconds | pytest store queries against pgvector, Go module tests, vitest + generated API types |
| **Large** | External services / full pipeline | Minutes | `benchmarks/ci-free-gates.sh` ladder, LLM-tier judge gates, portal `pnpm test:e2e` |

Small tests should make up the vast majority of your suite. They're fast, reliable, and easy to debug when they fail.

### Decision Guide

```
Is it pure logic with no side effects?
  → Small unit test (no DB, no LLM)

Does it cross a boundary (pgvector store, API surface, MCP kb.* tool, portal+backend)?
  → Medium test (pytest against a DB / Go integration / vitest)

Is it a behavioral product guarantee (faithfulness, citation accuracy, latency, tenant isolation)?
  → Large / LLM-tier test — a benchmarks/gates/ script — keep these to the real contract
```

## Writing Good Tests

### Use Parametrized / Table-Driven Tests

Parametrized tests (pytest `@pytest.mark.parametrize`, Go table-driven, vitest `it.each`) are the idiom. Each row is a named case; failures point at the exact case.

```python
def test_seal_unseal_round_trip():
    cases = [
        ("empty", ""),
        ("short", "hunter2"),
        ("unicode", "café-π-✓"),
    ]
    for name, plaintext in cases:
        sealed = seal(key, plaintext.encode())
        got = unseal(key, sealed)
        assert got.decode() == plaintext, name
```

### Test State, Not Interactions

Assert on the *outcome* of an operation, not on which internal functions were called. Tests that verify call sequences break when you refactor, even if behavior is unchanged.

```python
# Good: tests what the function does (state-based)
def test_synthesize_is_deterministic():
    # temperature == 0 is invariant on synthesize/cite/filter, so the
    # same memo input must yield the same answer.
    out_a = synthesize(memo=fixed_memo, tenant_id="t_acme")
    out_b = synthesize(memo=fixed_memo, tenant_id="t_acme")
    assert out_a.text == out_b.text
```

Don't assert "the LLM client was called with these args" — assert the deterministic outcome that the `temperature == 0` invariant guarantees.

### DAMP Over DRY in Tests

In production code, DRY is usually right. In tests, **DAMP (Descriptive And Meaningful Phrases)** is better. Each test should read like a specification without forcing the reader to trace shared helpers. Duplication in tests is acceptable when it makes each case independently understandable. (Parametrized rows are the sweet spot: shared body, self-describing data.)

### Prefer Real Implementations Over Mocks

Use the simplest test double that does the job. The more real code your tests exercise, the more confidence they give.

```
Preference order (most to least preferred):
1. Real implementation  → a real pgvector DB via docker compose (highest confidence)
2. Fake                 → in-memory store / fake clock / local sentence-transformers embeddings
3. Stub                 → a stubbed LLM transport returning canned, deterministic responses
4. Mock (interaction)   → verifies method calls — use sparingly
```

**Use stubs/mocks only when** the real dependency is too slow, non-deterministic, or has side effects you can't control (the MiniMax/Anthropic-compatible LLM endpoint, wall-clock time). For LLM calls, stub `llm-transport` with deterministic responses rather than hitting a live model in unit tests; reserve real model calls for the LLM-tier gates.

### Use Arrange-Act-Assert

```python
def test_check_acl_denies_cross_tenant():
    # Arrange
    chunk = make_chunk(tenant_id="t_acme")

    # Act
    allowed = check_acl(chunk, caller=caller_acl("t_globex"))

    # Assert
    assert allowed is False
```

### One Assertion Per Concept

Split behaviors into separate cases (or parametrized rows) rather than cramming validation, trimming, and length checks into one test.

### Name Tests Descriptively

```python
# Good: reads like a specification
def test_filter_refuses_when_no_citations(): ...
def test_retrieve_kb_enforces_tenant_acl_server_side(): ...

# Bad: vague
def test_filter(): ...
def test_works(): ...
```

## Test Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Testing implementation details | Tests break on refactor even when behavior is unchanged | Test inputs and outputs, not internal structure |
| Flaky / nondeterministic tests | Erode trust; an LLM call without `temperature == 0` or a stub is inherently flaky | Stub the LLM transport; deterministic clocks; isolate per-tenant state |
| Testing the framework / SDK | Wastes effort on third-party behavior | Only test YOUR code, not `anthropic-sdk-python` or pgvector itself |
| Letting raw KB chunks cross a boundary in a test | Encourages violating the compression invariant | Only `memo_schema_ref`-shaped objects cross stage boundaries — assert that |
| No tenant isolation | A test that ignores `tenant_id` hides cross-tenant bugs | Seed at least two tenants; assert results never cross |
| Mocking everything | Tests pass while production breaks | Real pgvector > fakes > stubbed LLM transport > mocks |

## End-to-End Verification with the Benchmark Ladder

For product-level guarantees, the deterministic benchmark ladder gives you a real, reproducible signal without flaky live-model calls in the inner loop:

```
1. REPRODUCE: run bash benchmarks/ci-free-gates.sh (deterministic ~2min ladder)
2. INSPECT: check the gate outputs under benchmarks/gates/ against the golden set
3. DIAGNOSE: compare actual vs threshold (faithfulness, citation accuracy, latency, isolation)
4. FIX: implement in source
5. VERIFY: re-run the ladder, then the LLM-tier judge gates for behavioral guarantees
```

The product's real contract is the benchmark thresholds: faithfulness >= 0.85 (`faithfulness-gte.sh 0.85`), citation accuracy >= 0.95 (`citation-accuracy-gte.sh 0.95`), p95 latency <= 12s (`latency-p95-lte.sh 12000`), cross-tenant isolation (`tenant-isolation-test.sh`), ACL escape (`retrieve-kb-acl-test.sh`). The golden set lives at `tests/fixtures/golden_set.json`. Every `#### Scenario:` that asserts a behavioral guarantee should reference the gate script that proves it.

### Trust Boundaries

Everything arriving from a user or an org's documents — chat messages, ingested KB content, connector payloads — is **untrusted data**, not instructions. The model's output is also untrusted: caller identity and ACL are inherited from the request and enforced server-side in `retrieve_kb`, never read back from the model. Tests should cover hostile inputs (prompt-injection-shaped documents, cross-tenant probes) and confirm they're handled as data and refused when ungrounded.

## When to Use Subagents for Testing

For complex bug fixes, spawn a subagent to write the reproduction test:

```
Main agent: "Spawn a subagent to write a reproduction test (in the touched
package's language) for this bug: [bug description]. The test should FAIL with
the current code — run the narrow test target to confirm."

Subagent: writes the reproduction test, confirms it fails.

Main agent: implements the fix, then confirms the test passes and the
resolver-selected gates are green.
```

Writing the test without knowledge of the fix makes it more robust.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll write tests after the code works" | You won't. And after-the-fact tests test implementation, not behavior. |
| "This is too simple to test" | Simple code gets complicated. The test documents the expected behavior. |
| "Tests slow me down" | They slow you down now and speed you up on every later change. |
| "I tested it manually" | Manual testing doesn't persist. Tomorrow's change breaks it silently. |
| "DB tests are skipping, so I'm fine" | A skip is not a pass. Set `DATABASE_URL`/`TEST_DATABASE_URL` to a pgvector instance for DB-backed work. |
| "It's just a prototype" | Prototypes become production. Tests from day one prevent test debt. |
| "Let me run the gates again to be extra sure" | After a clean run with no intervening edits, re-running adds nothing. Run again after the next change, not for reassurance. |

## Red Flags

- Writing code without any corresponding test in that package's language
- Tests that pass on the first run (they may not be testing what you think)
- "All tests pass" but no tests were actually run
- Bug fixes without reproduction tests
- Tests asserting on internal call order instead of behavior
- An LLM-calling test with no stub and no `temperature == 0` (nondeterministic)
- A test that ignores `tenant_id` / lets raw KB chunks cross a stage boundary
- Skipping or disabling tests to make the suite pass
- Treating a `DATABASE_URL`-skip as a green DB test
- Re-running the gates with no intervening code change

## Verification

After completing any implementation:

- [ ] Every new behavior has a corresponding test in the touched package's language (parametrized/table-driven where practical)
- [ ] The resolver-selected gates pass (uv/go/pnpm as applicable + `ci-free-gates.sh` + `openspec validate "<change>" --strict`)
- [ ] Bug fixes include a reproduction test that failed before the fix
- [ ] Test names describe the behavior being verified
- [ ] No tests were skipped or disabled to get green
- [ ] DB-dependent pytest actually ran against a pgvector instance — a skip without a DB is recorded, not failed, but it is not coverage either
- [ ] Behavioral guarantees are backed by the relevant `benchmarks/gates/` script (faithfulness/citation/latency/isolation)
- [ ] Coverage hasn't decreased (`pytest -q --cov --cov-report=term-missing`, or `go tool cover` for Go)

**Note:** Run a gate after a change that could affect its result. After a clean run, don't repeat the same command unless the code has changed since.

## MeKnow notes

- **OpenSpec lifecycle.** Non-trivial work is spec-driven: `/opsx:propose` → `/opsx:spec` → `/opsx:apply` → `/opsx:sync` → `/opsx:archive`. The autonomous `/opsx:ship` pipeline runs a **Test(Red) phase before Implement** — it writes the failing tests first, then the implementation makes them green. Test evidence (test output + coverage) is captured under `openspec/changes/<name>/evidence/`. Read the relevant `openspec/specs/<capability>/spec.md` before changing a subsystem, and update it via a change's delta + `/opsx:sync` when behavior changes. All OpenSpec work happens inside this `platform/` submodule.
- **Invariants your tests must respect:** multi-tenant by default — every table, query, cache key, and log line carries `tenant_id`, and cross-tenant joins are bugs; citations mandatory — any answer-producing path refuses rather than emit ungrounded claims (`filter` stage contains `refuse_if: no_citations`); `temperature == 0` on every `synthesize`, `cite`, and `filter` stage; ACL enforced server-side in `retrieve_kb`, caller identity inherited never trusted from the model; versions are append-only (`BotVersion`/`KBVersion`/golden sets/traces — new child with a parent pointer, never in-place mutation); the compression invariant — only `memo_schema_ref`-shaped objects cross stage boundaries, raw KB chunks never leave a sub-agent; MCP is the internal tool boundary (`kb.*` contract, embedded transport); no LangChain/LangGraph/Haystack/LlamaIndex — `anthropic-sdk-python` directly; OpenAPI is the API contract (portal types are generated, never hand-written).
- **Test-deliverable file patterns:** `tests/test_<feature>.py` (pytest) for Python, `<feature>_test.go` (table-driven) for Go, `apps/portal/src/**/<feature>.test.ts(x)` (vitest) for TypeScript. For the `/opsx:ship` Test(Red) phase the failing test is written in the touched package's language.
- **DB-dependent pytest** needs `DATABASE_URL`/`TEST_DATABASE_URL` pointing at a pgvector instance (local `docker compose -f docker-compose.dev.yml`; CI `pgvector/pgvector:pg16`). Absent a DB those tests skip — record the skip, it is not a failure, but it is not coverage either.
