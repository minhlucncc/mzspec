export const meta = {
  name: 'spec-pr',
  description:
    'Open the SPEC PR for an OpenSpec change whose 6-axis review has APPROVED (stage 2 of the platform workflow: spec review & merge). Preflight (resolve the change, require review/REVIEW.md verdict=APPROVE + `openspec validate --strict`, clean tree) → Sync (merge the change delta specs into canonical openspec/specs/ via the openspec-sync-specs skill — the contract becomes law) → Spec PR (branch spec/<slug>, commit ONLY the spec artifacts + the synced canonical specs, push, `gh pr create --base main` a code-free spec PR, STOP — no auto-merge). The change stays ACTIVE for implementation. Honors dryRun (commit on the branch, no push/gh), base, reserveTokens. Submodule-scoped: all git ops happen inside platform/; never touches the superproject.',
  phases: [
    { title: 'Preflight', detail: 'resolve change, require REVIEW.md=APPROVE + validate --strict + clean tree' },
    { title: 'Sync',      detail: 'merge delta specs into canonical openspec/specs/ (openspec-sync-specs)' },
    { title: 'Spec PR',   detail: 'branch spec/<slug>, commit spec artifacts + synced specs, push, gh pr create (stops)' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
const change = A.change
const date = A.date
const dryRun = !!A.dryRun
const base = A.base || 'main'
const reserve = A.reserveTokens || 40000

if (!change || typeof change !== 'string') {
  throw new Error('spec-pr requires args { change, date?, dryRun?, base? }; got typeof=' + (typeof args) + ' keys=' + Object.keys(A).join(','))
}
if (!/^[a-z][a-z0-9-]*$/.test(change)) throw new Error('Unsafe change name (must start with a letter, kebab-case): ' + change)
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Unsafe date (expected YYYY-MM-DD): ' + date)

const branch = `spec/${change}`
const SKILL = (name) => `the \`${name}\` skill (.claude/skills/${name}/SKILL.md)`

// ---------------------------------------------------------------- Phase 1: Preflight
phase('Preflight')
const PRE = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'reason', 'reviewApproved', 'validateOk', 'treeClean', 'changeRoot', 'specPaths', 'title'],
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    reviewApproved: { type: 'boolean' },
    validateOk: { type: 'boolean' },
    treeClean: { type: 'boolean' },
    changeRoot: { type: 'string' },
    specPaths: { type: 'array', items: { type: 'string' } },
    proposalPath: { type: 'string' },
    designPath: { type: 'string' },
    tasksPath: { type: 'string' },
    title: { type: 'string' },
  },
}
const pre = await agent(
  [
    `Preflight the SPEC PR for OpenSpec change "${change}" (base "${base}"). Use Bash. Steps:`,
    `1. TOOLS: command -v openspec gh git node. gh is required (this opens a remote PR). If missing → ok=false+reason+STOP.`,
    `2. openspec status --change "${change}" --json — capture changeRoot, the proposal path, design path, tasks path, and the delta-spec paths (specs/**/*.md under the change), and the change title. If the change does not exist → ok=false, reason="no such change — run /opsx:propose first", STOP.`,
    `3. REVIEW GATE: read "<changeRoot>/review/REVIEW.md". Set reviewApproved=true ONLY if its Verdict is APPROVE. If the file is missing or Verdict is REVISE → reviewApproved=false, ok=false, reason="run /opsx:spec ${change} until it APPROVES before opening the spec PR".`,
    `4. openspec validate "${change}" --strict (fallback non-strict). validateOk=true only if it passes. Else ok=false+reason+STOP.`,
    `5. WORKING TREE: git status --porcelain. treeClean=true if empty OR the only changes are under openspec/ (spec authoring in flight). If unrelated code is dirty → ok=false, reason="commit or stash unrelated changes first".`,
    `6. The change MUST have at least one delta spec (specPaths non-empty) — a spec PR with no spec changes is meaningless. If empty → ok=false, reason="no delta specs to merge".`,
    `Set ok=true only when reviewApproved && validateOk && treeClean && specPaths non-empty. Do NOT edit any file.`,
  ].join('\n'),
  { schema: PRE, label: 'preflight', phase: 'Preflight', agentType: 'general-purpose' },
)
if (!pre || !pre.ok) {
  return { stage: 'preflight', ok: false, reason: pre ? pre.reason : 'preflight agent returned null', change, branch }
}
log(`preflight ok: review APPROVED, validate clean, ${pre.specPaths.length} delta spec(s)`)

// ---------------------------------------------------------------- Phase 2: Sync delta → canonical
phase('Sync')
if (budget && budget.total && budget.remaining() < reserve) {
  return { stage: 'sync', ok: false, reason: 'budget reserve reached before sync', change, branch }
}
const SYNCED = { type: 'object', additionalProperties: false, required: ['synced', 'notes'], properties: { synced: { type: 'boolean' }, notes: { type: 'string' }, canonicalPaths: { type: 'array', items: { type: 'string' } } } }
const synced = await agent(
  [
    `On a NEW branch "${branch}" created from "${base}", merge the delta specs for change "${change}" into the canonical specs. Use Bash + ${SKILL('openspec-sync-specs')}.`,
    `1. git switch -c "${branch}" "${base}"  (if the branch already exists, switch to it and reset to ${base}: git switch "${branch}").`,
    `2. Invoke Skill({ skill: "openspec-sync-specs" }) for change "${change}": merge ADDED/MODIFIED/REMOVED/RENAMED from the change's delta specs (${pre.specPaths.join(', ')}) into openspec/specs/<capability>/spec.md. Idempotent — re-running is a no-op.`,
    `3. openspec validate --specs MUST pass after the merge. If not, fix the canonical specs and re-validate. Capture the list of canonical spec files changed (canonicalPaths). Do NOT commit yet.`,
    `Return synced=true if the merge ran (even if idempotent no-op on an already-synced spec).`,
  ].join('\n'),
  { schema: SYNCED, label: 'sync-specs', phase: 'Sync', agentType: 'general-purpose' },
)
if (!synced || !synced.synced) {
  return { stage: 'sync', ok: false, reason: synced ? synced.notes : 'sync agent returned null', change, branch }
}
log(`sync: delta → canonical (${(synced.canonicalPaths || []).length} spec file(s))`)

// ---------------------------------------------------------------- Phase 3: commit + push + open the SPEC PR
phase('Spec PR')
if (budget && budget.total && budget.remaining() < reserve) {
  return { stage: 'spec-pr', ok: false, reason: 'budget reserve reached before committing/opening the spec PR; synced specs are uncommitted on ' + branch, change, branch }
}
const FIN = {
  type: 'object', additionalProperties: false,
  required: ['committed', 'pushed', 'prUrl', 'prExisted', 'notes'],
  properties: { committed: { type: 'boolean' }, pushed: { type: 'boolean' }, prUrl: { type: ['string', 'null'] }, prExisted: { type: 'boolean' }, notes: { type: 'string' } },
}
const fin = await agent(
  [
    `Open the SPEC PR for change "${change}" (title "${pre.title}") on branch "${branch}". Use Bash (git + gh). This PR carries the SPEC ONLY — proposal + delta specs + design + tasks + the synced canonical specs. NO production code.`,
    `1. Stage ONLY the spec artifacts (do NOT use git add -A): git add "${pre.changeRoot}" openspec/specs/ . Confirm git status shows no source/app/package code staged — if any non-spec/non-openspec file is staged, unstage it.`,
    `2. git commit -m "spec(${change}): ${pre.title}" -m "Review & merge the contract before implementation." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>". Set committed.`,
    dryRun
      ? `3. DRY RUN: stop after the commit — do NOT push and do NOT run gh. Set pushed=false, prUrl=null, prExisted=false, notes="dry run".`
      : `3. Push: git push -u origin "${branch}".`,
    dryRun ? `` : `4. Existing PR? gh pr view "${branch}" --json url,state 2>/dev/null. If OPEN → prExisted=true, reuse its url (the push updated it). Else gh pr create --base "${base}" --head "${branch}" --title "spec(${change}): ${pre.title}" --body <body>. Body: the proposal's what-and-why; a "## Spec contract" section listing the touched capabilities (${(synced.canonicalPaths || []).join(', ') || 'see openspec/specs/'}); a "## Review checklist" (requirements use SHALL/MUST + ≥1 scenario; minimal/testable/consistent); a note "Merging this PR locks the contract; implementation follows via /opsx:ship ${change}"; and a final "🤖 Generated with [Claude Code](https://claude.com/claude-code)". Capture prUrl.`,
    dryRun ? `` : `5. LIFECYCLE (best-effort — NEVER fail the spec PR on this): extract the PR number from prUrl, then run \`node .claude/workflows/lib/lifecycle.js after-spec-pr-opened --change "${change}" --branch "${branch}" --spec-pr "<prUrl>" --spec-pr-number "<prNumber>"\`. It comments the linked ticket + records the spec PR ref; if the change isn't linked to a ticket it no-ops; if it errors, log and CONTINUE.`,
    `Return the structured result. If push/gh fails, set pushed=false/prUrl=null and explain in notes — the commit stands on ${branch}.`,
  ].filter(Boolean).join('\n'),
  { schema: FIN, label: dryRun ? 'spec-pr (dry-run)' : 'spec-pr', phase: 'Spec PR', agentType: 'general-purpose' },
)

return {
  stage: 'done', ok: true, change, title: pre.title, branch, base, dryRun,
  specsSynced: true,
  committed: !!(fin && fin.committed),
  pushed: !!(fin && fin.pushed),
  prExisted: !!(fin && fin.prExisted),
  prUrl: fin ? fin.prUrl : null,
  notes: fin ? fin.notes : 'spec-pr agent returned null',
  nextStep: dryRun
    ? `Dry run complete on ${branch}: spec artifacts + synced canonical specs committed. Inspect git log --stat, then re-run without dryRun to push + open the spec PR.`
    : `Spec PR ${fin && fin.prExisted ? 'updated' : 'opened'}. After a human reviews & MERGES it (canonical specs land on ${base}), run /opsx:ship ${change} to implement against the locked contract.`,
}
