# Spec Review and Quality

Six-axis spec review methodology. Each axis is evaluated independently,
then findings are consolidated into a review report.

## Axes

1. **Structure & validity** — `openspec validate --strict` passes; Purpose + Requirements sections;
   SHALL/MUST in the body line; >=1 Scenario each; delta uses ADDED/MODIFIED/REMOVED/RENAMED
   with the FULL requirement on MODIFY
2. **Clarity / KISS** — unambiguous, no jargon, one concept per sentence
3. **Testability** — every requirement has a clear pass/fail test scenario
4. **Minimality / YAGNI** — no scope beyond what's stated, no speculative features
5. **Consistency / DRY** — terminology is consistent with existing specs, no duplication
6. **Completeness** — no dangling references, all edge cases addressed

## Process

1. Run `node .claude/workflows/lib/openspec.js validate "<change>" --strict`
2. Review each axis independently
3. Fix Blocker/Required findings, re-validate
4. Write REVIEW.md with verdict and findings

Severity: Blocker (invalid/untestable/contradicts invariant) > Required (fix before ship) > Nit (optional) > FYI.
