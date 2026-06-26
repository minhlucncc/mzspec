export const meta = {
  name: 'merge-pr',
  description:
    'Team-lead PR merge workflow. Given an OpenSpec change slug or a PR URL, it preflights (PR status, linked issues, changelog), optionally updates the title/body/closing keywords and adds changelog entry, archives the OpenSpec change as a commit on the branch, then merges the PR via GitHub and closes linked issues. After the merge it runs an AGENT HOOK RUNNER phase that fires the lifecycle event (ticket comment + status via lifecycle.js, the executable on-<event> shell hook, and an optional agent-form on-<event>.agent.md hook). The archive + changelog commit goes on the branch BEFORE merge so the PR review includes it. Honors dryRun (show what it would do; no merge/close/archive/hooks).',
  phases: [
    { title: 'Preflight', detail: 'find PR, check status, detect linked issues, check changelog' },
    { title: 'Prepare',   detail: 'update PR title/body/closing keywords, add changelog if missing' },
    { title: 'Archive',   detail: 'archive the OpenSpec change as a commit on the branch before merge' },
    { title: 'Merge',     detail: 'merge PR via GitHub API, close linked issues' },
    { title: 'Hooks',     detail: 'agent hook-runner — fire the lifecycle event (ticket comment, status, shell + agent-form hooks)' },
    { title: 'Summary',   detail: 'report merge SHA, closed issues, PR URL, archive + hook status' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
let change = A.change             // optional: OpenSpec change slug (may be auto-detected from branch)
const pr = A.pr                   // optional: explicit PR URL/number (overrides change)
const dryRun = !!A.dryRun
const strategy = A.strategy || 'squash'  // squash | merge | rebase
const title = A.title || ''       // override PR title (empty = keep existing)
const body = A.body || ''         // override/append PR body (empty = keep existing)
let repo = A.repo || ''           // optional: "owner/repo" for cross-repo PRs (may be reassigned by preflight)
const closes = A.closes || ''     // explicit "Closes #N" to add (empty = auto-detect from existing PR)
const base = A.base || 'main'
const skipArchive = !!A.skipArchive  // skip the OpenSpec archive step after merge
const reserve = A.reserveTokens || 20000

if (!change && !pr) {
  throw new Error('merge-pr requires either { change } (OpenSpec slug) or { pr } (PR URL/number).')
}
if (change && !/^[a-z][a-z0-9-]*$/.test(change)) {
  throw new Error('Unsafe change name (must start with a letter, kebab-case): ' + change)
}
if (!['squash', 'merge', 'rebase'].includes(strategy)) {
  throw new Error('strategy must be one of: squash, merge, rebase')
}

let branch = change ? `feat/${change}` : null
let prNumber, prUrl, owner

// ---------------------------------------------------------------- Phase 1: Preflight
phase('Preflight')
const PRE = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'reason', 'prNumber', 'prUrl', 'owner', 'repo', 'state', 'isDraft', 'mergeable', 'headSha', 'headRefName', 'baseRef', 'title', 'body', 'closingIssues', 'changelogEntry'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    prNumber: { type: 'integer' }, prUrl: { type: 'string' },
    owner: { type: 'string' }, repo: { type: 'string' },
    state: { type: 'string' }, isDraft: { type: 'boolean' },
    mergeable: { type: ['string', 'null'] },
    headSha: { type: 'string' }, headRefName: { type: 'string' }, baseRef: { type: 'string' },
    title: { type: 'string' }, body: { type: 'string' },
    closingIssues: { type: 'array', items: { type: 'integer' } },
    changelogEntry: { type: 'string' },
  },
}
const pre = await agent(
  [
    `Preflight for merge-pr. Use Bash (gh, git, node). Steps:`,
    `1. TOOLS: command -v gh git node; gh auth status → ok=false+reason+STOP if missing.`,
    repo ? `   NOTE: Using cross-repo mode — all gh commands need --repo "${repo}".` : '',
    branch
      ? `2. Find the open PR for branch "${branch}": gh pr view "${branch}" ${repo ? `--repo "${repo}"` : ''} --json number,url,state,isDraft,mergeable,headRefName,baseRefName,headRefOid,title,body,closingIssuesReferences. If none OPEN → ok=false+reason+STOP.`
      : `2. Parse PR# from "${pr}" (URL or number). If it's a full GitHub URL (https://github.com/.../pull/N), extract owner, repo, and number from it. Then: gh pr view <number> ${repo ? `--repo "${repo}"` : '--repo owner/repo (extracted from URL)'} --json number,url,state,isDraft,mergeable,headRefName,baseRefName,headRefOid,title,body,closingIssuesReferences.`,
    `3. Parse owner/repo: if repo was provided as arg, use that. Otherwise from gh repo view --json name,owner, or from the URL.`,
    `4. Extract: prNumber, prUrl, state, isDraft, mergeable, headSha(headRefOid), headRefName (the branch name, e.g. "feat/c0005-xxx" or "spec/c0000-clean-old-structure"), baseRef(baseRefName), title, body, closingIssues (list of issue numbers from closingIssuesReferences. If closingIssuesReferences API is empty, check the body for "Closes #N" / "Fixes #N" patterns).`,
    `5. If this is an OpenSpec change (branch starts with "feat/"), check if a CHANGELOG entry exists:`,
    `   - git fetch origin "${branch}" 2>/dev/null; git diff origin/main...origin/"${branch}" -- CHANGELOG.md | head -80`,
    `   - Capture the changelogEntry (the added lines) or empty string if none found.`,
    `   - Skip CHANGELOG check if remote repo (not the local project).`,
    `6. Gate checks:`,
    `   - state must be "OPEN" → ok=false if not`,
    `   - isDraft must be false → ok=false + reason "PR is a draft — mark it ready for review first"`,
    `   - mergeable should not be "CONFLICTING" → ok=false + reason "PR has merge conflicts — resolve them first"`,
    `Return ok, reason, prNumber, prUrl, owner, repo, state, isDraft, mergeable, headSha, baseRef, title, body, closingIssues[], changelogEntry.`,
    `IMPORTANT: If you derived owner/repo from a URL, return the correct owner and repo values so downstream phases use them.`,
  ].join('\n'),
  { schema: PRE, label: 'preflight', phase: 'Preflight', agentType: 'general-purpose' },
)
if (!pre || !pre.ok) {
  return { stage: 'preflight', ok: false, reason: pre ? pre.reason : 'preflight agent returned null', change, pr }
}

prNumber = pre.prNumber
prUrl = pre.prUrl
owner = pre.owner
repo = pre.repo
log(`PR #${prNumber}: "${pre.title}" — ${pre.state}, draft=${pre.isDraft}, mergeable=${pre.mergeable}`)
if (pre.closingIssues.length) {
  log(`Linked issues: #${pre.closingIssues.join(', #')}`)
}
if (pre.changelogEntry) {
  log(`Changelog entry found (${pre.changelogEntry.length} chars)`)
} else if (change) {
  log(`No CHANGELOG.md entry found for change "${change}"`)
}

// Auto-detect OpenSpec change from branch name if not explicitly provided.
// Supports: feat/<slug>, spec/<slug>, chore/<slug>, fix/<slug>
const BRANCH_CHANGE_RE = /^(?:feat|spec|chore|fix)\/([a-z][a-z0-9-]*)$/
if (!change && pre.headRefName) {
  const m = pre.headRefName.match(BRANCH_CHANGE_RE)
  if (m) {
    change = m[1]
    branch = pre.headRefName
    log(`Auto-detected OpenSpec change "${change}" from branch "${pre.headRefName}"`)
  }
}

// ---------------------------------------------------------------- Phase 2: Prepare — update PR title/body if requested
phase('Prepare')
if (budget && budget.total && budget.remaining() < reserve) {
  return { stage: 'prepare', ok: false, reason: 'budget reserve reached before prepare', ...pre }
}

// Determine final title and body
const finalTitle = title || pre.title
let finalBody = body || pre.body

// If closes is specified, ensure it's in the body
if (closes) {
  // Parse issue numbers from closes string (e.g. "Closes #74, #75" or just "74")
  const closeNums = closes.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean)
  const closeLines = closeNums.map((n) => `Closes #${n}`).join('\n')
  if (!finalBody.includes(closeLines)) {
    finalBody = finalBody
      ? finalBody + '\n\n' + closeLines
      : closeLines
  }
}

const needsUpdate = finalTitle !== pre.title || finalBody !== pre.body
if (needsUpdate) {
  if (dryRun) {
    log(`Would update PR title/body: title="${finalTitle}"`)
  } else {
    const updated = await agent(
      [
        `Update PR #${prNumber} in ${owner}/${repo}.`,
        `New title: "${finalTitle}"`,
        `New body: starts with "${finalBody.slice(0, 100)}..."`,
        ``,
        `Run: gh pr edit ${prNumber} --title "${finalTitle.replace(/"/g, '\\"')}" --body "${finalBody.replace(/"/g, '\\"')}" ${repo ? `--repo "${owner}/${repo}"` : ''}`,
        `Return { ok: true } on success, or the error message.`,
      ].join('\n'),
      {
        label: 'update-pr',
        phase: 'Prepare',
        schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' } } },
        agentType: 'general-purpose',
      },
    )
    if (!updated || !updated.ok) {
      return { stage: 'prepare', ok: false, reason: 'Failed to update PR: ' + (updated ? updated.error : 'unknown'), ...pre }
    }
    log(`PR #${prNumber} title/body updated`)
  }
} else {
  log('PR title/body unchanged')
}

// If dry run, stop here
if (dryRun) {
  return {
    stage: 'dry-run', ok: true, prUrl, prNumber, owner, repo, headSha: pre.headSha,
    mergeStrategy: strategy,
    closingIssues: pre.closingIssues,
    wouldMerge: true,
    wouldUpdatePR: needsUpdate,
    nextStep: `Dry run complete for PR #${prNumber}. Re-run without --dryRun to merge.`,
  }
}

// ---------------------------------------------------------------- Phase 3: Archive (on the branch, BEFORE merge)
phase('Archive')
let archived = false
let archiveReason = ''
let archiveSha = ''

if (!change || skipArchive) {
  archiveReason = skipArchive ? 'skipped via --skip-archive' : 'not an OpenSpec change (no --change)'
} else if (budget && budget.total && budget.remaining() < reserve) {
  archiveReason = 'budget reserve reached — skip archive'
} else {
  const archiveResult = await agent(
    [
      `Archive the OpenSpec change "${change}" on the branch BEFORE merging PR #${prNumber}.`,
      `The archive commit goes on the branch so it's included in the PR review.`,
      `Branch: "${branch}" (feat/${change})`,
      `Steps:`,
      `1. Switch to the branch: git switch "${branch}" 2>/dev/null || git switch -c "${branch}" origin/"${branch}"`,
      `2. Pull the latest: git pull origin "${branch}" --ff-only 2>/dev/null || true`,
      `3. Check if openspec CLI is available: which openspec 2>/dev/null`,
      `   - If available: openspec archive "${change}" -y`,
      `   - If not (or if openspec archive fails): manually archive:`,
      `     TODAY=$(date +%Y-%m-%d)`,
      `     mkdir -p openspec/changes/archive`,
      `     if [ -d "openspec/changes/${change}" ]; then`,
      `       mv openspec/changes/"${change}" "openspec/changes/archive/${'${TODAY}'}-${change}"`,
      `     fi`,
      `4. Commit only the archive changes (no git add -A):`,
      `     git add openspec/changes/archive/`,
      `     git commit -m "chore(${change}): archive completed change"`,
      `5. Push the branch: git push origin "${branch}"`,
      `Return { archived: true, commitSha: "<sha>" } on success.`,
      `Return { archived: false, reason: "<message>" } on failure (e.g. openspec/changes/${change} doesn't exist).`,
    ].join('\n'),
    {
      label: 'archive',
      phase: 'Archive',
      schema: {
        type: 'object', additionalProperties: false,
        required: ['archived'],
        properties: { archived: { type: 'boolean' }, reason: { type: 'string' }, commitSha: { type: 'string' } },
      },
      agentType: 'general-purpose',
    },
  )
  archived = !!(archiveResult && archiveResult.archived)
  archiveSha = archiveResult ? (archiveResult.commitSha || '') : ''
  if (archiveResult && archiveResult.reason) archiveReason = archiveResult.reason
  if (archived) log(`Archived change "${change}" on branch (${archiveSha.slice(0, 7)})`)
  else log(`Archive skipped or failed: ${archiveReason || 'unknown'}`)
}

// ---------------------------------------------------------------- Phase 4: Merge (GitHub API, after archive)
phase('Merge')
if (budget && budget.total && budget.remaining() < reserve) {
  return { stage: 'merge', ok: false, reason: 'budget reserve reached before merge', prUrl, prNumber }
}

// Which lifecycle event this merge represents (spec/<c> vs feat/<c>); empty when the
// PR isn't an OpenSpec change branch (lifecycle would no-op anyway).
const isSpecPrMerge = !!(pre.headRefName && pre.headRefName.startsWith('spec/'))
const lcMergedEvent = change ? (isSpecPrMerge ? 'after-spec-pr-merged' : 'after-code-pr-merged') : ''

const mergeResult = await agent(
  [
    `Merge PR #${prNumber} in ${owner}/${repo} using ${strategy} merge strategy.`,
    `Head SHA: ${pre.headSha}`,
    `Title: "${finalTitle}"`,
    archived ? `Note: Archive commit ${archiveSha.slice(0, 7)} is on the branch and will be included in the merge.` : '',
    repo ? `Repo: ${owner}/${repo}` : '',
    ``,
    `1. Merge: gh pr merge ${prNumber} --${strategy} --delete-branch ${repo ? `--repo "${owner}/${repo}"` : ''}`,
    `   If --squash: also pass --subject "${finalTitle.replace(/"/g, '\\"')}" to set the squash commit title.`,
    ``,
    `2. Capture the merge result: gh pr view ${prNumber} --json mergedAt,mergeCommit,state ${repo ? `--repo "${owner}/${repo}"` : ''}`,
    `   Extract mergeCommit.oid (the merge commit SHA).`,
    ``,
    `3. For each linked issue #${pre.closingIssues.join(', #') || '(none)'}:`,
    `   - Close it: gh issue close <num> --comment "Closed by merge of PR #${prNumber} (${pre.headSha.slice(0, 7)})" ${repo ? `--repo "${owner}/${repo}"` : ''}`,
    `   - The comment body should include a cross-reference: "Merged in PR #${prNumber}"`,
    ``,
    `4. If no linked issues were detected but the PR body contains "Closes #N" / "Fixes #N":`,
    `   - Parse the body for those patterns`,
    `   - Close those issues too`,
    ``,
    `Return { merged: true, mergeSha, state, issuesClosed: [numbers] }. On failure, return { merged: false, error: "<message>" }.`,
  ].join('\n'),
  {
    label: 'merge',
    phase: 'Merge',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['merged'],
      properties: {
        merged: { type: 'boolean' },
        mergeSha: { type: 'string' },
        state: { type: 'string' },
        issuesClosed: { type: 'array', items: { type: 'integer' } },
        error: { type: 'string' },
      },
    },
    agentType: 'general-purpose',
  },
)

if (!mergeResult || !mergeResult.merged) {
  phase('Summary')
  return {
    stage: 'merge-failed', ok: false, prUrl, prNumber,
    error: mergeResult ? mergeResult.error : 'merge agent returned null',
    nextStep: `Merge failed for PR #${prNumber}. Resolve the issue and retry.`,
  }
}

// ---------------------------------------------------------------- Phase 5: Hooks — agent hook-runner for the lifecycle event
// One explicit, first-class step drives ALL post-merge wiring (instead of burying it
// in the merge agent's prompt): the deterministic lifecycle (ticket comment + status +
// the executable on-<event> shell hook) AND an optional agent-form on-<event>.agent.md
// hook — natural-language instructions an agent executes with tools. Best-effort: a
// hook failure never un-does the merge.
phase('Hooks')
let hooks = { ran: false, skipped: lcMergedEvent ? '' : 'not-an-openspec-change-branch' }
if (lcMergedEvent && !(budget && budget.total && budget.remaining() < reserve)) {
  const archiveGlob = `$(ls -d openspec/changes/archive/*-${change} 2>/dev/null | head -1)`
  const lifecycleCmd =
    `node .claude/workflows/lib/lifecycle.js ${lcMergedEvent} --change "${change}" ` +
    `--merged-sha "${mergeResult.mergeSha}" ` +
    `${isSpecPrMerge ? `--spec-pr-number ${prNumber}` : `--code-pr-number ${prNumber}`}` +
    `${archived ? ` --archive-path "${archiveGlob}"` : ''} --json`
  const HOOKS = {
    type: 'object', additionalProperties: false,
    required: ['ran'],
    properties: {
      ran: { type: 'boolean' },
      lifecycle: {
        type: 'object', additionalProperties: true,
        properties: {
          commented: { type: 'boolean' }, statusSet: { type: 'boolean' },
          skipped: { type: 'string' }, shellHookRan: { type: 'boolean' },
        },
      },
      agentHook: {
        type: 'object', additionalProperties: true,
        properties: { found: { type: 'boolean' }, ran: { type: 'boolean' }, summary: { type: 'string' } },
      },
      errors: { type: 'array', items: { type: 'string' } },
    },
  }
  const hookResult = await agent(
    [
      `You are the AGENT HOOK RUNNER for the merge-pr workflow. PR #${prNumber} has ALREADY been merged.`,
      `Your job: fire the post-merge lifecycle event "${lcMergedEvent}" for OpenSpec change "${change}".`,
      `This is BEST-EFFORT — NEVER fail. Capture every problem in errors[] and keep going.`,
      ``,
      `Context (use it for both steps):`,
      `- change: ${change}`,
      `- event: ${lcMergedEvent}`,
      `- merged PR: #${prNumber} (${prUrl})`,
      `- merge SHA: ${mergeResult.mergeSha}`,
      `- ${isSpecPrMerge ? 'this is the SPEC PR merge' : 'this is the CODE PR merge'}`,
      archived ? `- change was archived on the branch (archive dir matches *-${change})` : '',
      ``,
      `STEP 1 — deterministic lifecycle (ticket comment + status + the executable on-${lcMergedEvent} shell hook):`,
      `  Run exactly: ${lifecycleCmd}`,
      `  Parse the JSON stdout. Map: lifecycle.commented <- did.commented, lifecycle.statusSet <- did.statusSet,`,
      `  lifecycle.shellHookRan <- did.hookRan, lifecycle.skipped <- (top-level "skipped" field, e.g. "no-link").`,
      `  A {skipped:"no-link"} result is NORMAL (the change isn't linked to a ticket) — record it, do NOT treat it as an error.`,
      ``,
      `STEP 2 — agent-form hook (optional, repo-defined, tool-using):`,
      `  Check whether the file openspec/hooks/on-${lcMergedEvent}.agent.md exists.`,
      `  - If absent: set agentHook.found=false and skip.`,
      `  - If present: READ it and FOLLOW its instructions as your task, using the context above. It may use tools`,
      `    (gh, git, node, etc.) to do agentic work the shell hook can't — e.g. draft a release note, comment a PR,`,
      `    open a follow-up. Summarise what you actually did in agentHook.summary; set agentHook.found=true and`,
      `    agentHook.ran=true (or ran=false + an errors[] entry if its instructions failed).`,
      ``,
      `Return { ran:true, lifecycle:{...}, agentHook:{...}, errors:[...] }.`,
    ].filter(Boolean).join('\n'),
    { schema: HOOKS, label: 'hook-runner', phase: 'Hooks', agentType: 'general-purpose' },
  )
  hooks = hookResult || { ran: false, errors: ['hook-runner agent returned null'] }
  const lc = hooks.lifecycle || {}
  if (lc.commented) log(`Lifecycle: commented the linked ticket for ${lcMergedEvent}`)
  else if (lc.skipped) log(`Lifecycle: ${lc.skipped} — no ticket comment (change not linked)`)
  if (lc.shellHookRan) log(`Shell hook on-${lcMergedEvent} ran`)
  if (hooks.agentHook && hooks.agentHook.ran) log(`Agent hook on-${lcMergedEvent}.agent.md ran`)
  if (hooks.errors && hooks.errors.length) log(`Hook errors (non-fatal): ${hooks.errors.join('; ')}`)
} else if (!lcMergedEvent) {
  log('Hooks: PR is not an OpenSpec change branch — no lifecycle event to fire')
} else {
  hooks = { ran: false, skipped: 'budget-reserve-reached' }
  log('Hooks: skipped — budget reserve reached')
}

// ---------------------------------------------------------------- Phase 6: Summary
phase('Summary')
const issuesClosed = mergeResult.issuesClosed || []

const lc = hooks.lifecycle || {}
const postMergeNotes = []
if (archived) {
  postMergeNotes.push(`- 📦 Change "${change}" archived on branch, included in merge.`)
}
if (lcMergedEvent) {
  if (lc.commented) postMergeNotes.push(`- 🪝 Lifecycle \`${lcMergedEvent}\` fired — linked ticket commented${lc.statusSet ? ' + status advanced' : ''}.`)
  else if (lc.skipped === 'no-link') postMergeNotes.push(`- 🪝 Lifecycle \`${lcMergedEvent}\`: change is not linked to a ticket (no \`.task-link.json\`) — no comment. Link it via \`/opsx:task-pull\` / \`/opsx:task-push\` to enable.`)
  else if (lc.skipped) postMergeNotes.push(`- 🪝 Lifecycle \`${lcMergedEvent}\`: skipped (${lc.skipped}).`)
  if (hooks.agentHook && hooks.agentHook.ran) postMergeNotes.push(`- 🤖 Agent hook \`on-${lcMergedEvent}.agent.md\`: ${hooks.agentHook.summary || 'ran'}.`)
  if (hooks.errors && hooks.errors.length) postMergeNotes.push(`- ⚠️ Hook errors (non-fatal): ${hooks.errors.join('; ')}`)
}
if (!pre.changelogEntry && change) {
  postMergeNotes.push(`- Consider adding a CHANGELOG entry for ${change} if not already present.`)
}

return {
  stage: 'done', ok: true,
  prUrl, prNumber,
  mergeSha: mergeResult.mergeSha,
  mergeStrategy: strategy,
  headSha: pre.headSha,
  titleUpdated: needsUpdate,
  issuesClosed,
  archived,
  archiveReason,
  archiveSha,
  changelogPresent: !!pre.changelogEntry,
  lifecycleEvent: lcMergedEvent || null,
  hooks,
  prTitle: finalTitle,
  nextStep: [
    `✅ Merged PR #${prNumber} (${strategy}) — commit \`${mergeResult.mergeSha}\``,
    issuesClosed.length ? `   Closed issue(s): #${issuesClosed.join(', #')}` : '   No linked issues to close.',
    archived ? `   📦 Change archived: chore(${change}): archive (${archiveSha.slice(0, 7)})` : '',
    `   PR: ${prUrl}`,
    ``,
    `**Post-merge:**`,
    ...postMergeNotes,
  ].filter(Boolean).join('\n'),
}
