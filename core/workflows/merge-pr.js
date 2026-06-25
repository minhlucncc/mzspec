export const meta = {
  name: 'merge-pr',
  description:
    'Team-lead PR merge workflow. Given an OpenSpec change slug or a PR URL, it preflights (PR status, linked issues, changelog), optionally updates the title/body/closing keywords and adds changelog entry, archives the OpenSpec change as a commit on the branch, then merges the PR via GitHub, closes linked issues, and reports. The archive + changelog commit goes on the branch BEFORE merge so the PR review includes it. Honors dryRun (show what it would do; no merge/close/archive).',
  phases: [
    { title: 'Preflight', detail: 'find PR, check status, detect linked issues, check changelog' },
    { title: 'Prepare',   detail: 'update PR title/body/closing keywords, add changelog if missing' },
    { title: 'Archive',   detail: 'archive the OpenSpec change as a commit on the branch before merge' },
    { title: 'Merge',     detail: 'merge PR via GitHub API, close issues, post linking comments' },
    { title: 'Summary',   detail: 'report merge SHA, closed issues, PR URL, archive status' },
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
      `   - If available: openspec archive "${change}"`,
      `   - If not: manually archive:`,
      `     TODAY=$(date +%Y-%m-%d)`,
      `     mkdir -p openspec/changes/archive`,
      `     mv openspec/changes/"${change}" "openspec/changes/archive/${'${TODAY}'}-${change}"`,
      `4. If CHANGELOG.md exists and has no entry for this change, add one:`,
      `   - Read the current CHANGELOG.md`,
      `   - Add a line under ### Added or the appropriate section`,
      `5. Commit:`,
      `     git add openspec/changes/ CHANGELOG.md 2>/dev/null || git add -A`,
      `     git commit -m "chore(${change}): archive completed change"`,
      `6. Push the branch: git push origin "${branch}"`,
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
    lcMergedEvent
      ? `5. LIFECYCLE (best-effort — NEVER fail the merge on this): after the merge succeeds, run \`node .claude/workflows/lib/lifecycle.js ${lcMergedEvent} --change "${change}" --merged-sha "<mergeSha>" ${isSpecPrMerge ? `--spec-pr-number ${prNumber}` : `--code-pr-number ${prNumber}`}${archived ? ` --archive-path "$(ls -d openspec/changes/archive/*-${change} 2>/dev/null | head -1)"` : ''}\`. ${isSpecPrMerge ? 'It comments the linked ticket that the spec contract is merged.' : 'It comments the linked ticket with the ticket → spec PR → code PR traceability and sets it done.'} No-ops when the change isn't linked to a ticket; on any error, log and CONTINUE.`
      : ``,
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

// ---------------------------------------------------------------- Phase 5: Summary
phase('Summary')
if (!mergeResult || !mergeResult.merged) {
  return {
    stage: 'merge-failed', ok: false, prUrl, prNumber,
    error: mergeResult ? mergeResult.error : 'merge agent returned null',
    nextStep: `Merge failed for PR #${prNumber}. Resolve the issue and retry.`,
  }
}

const issuesClosed = mergeResult.issuesClosed || []

const postMergeNotes = []
if (archived) {
  postMergeNotes.push(`- 📦 Change "${change}" archived on branch, included in merge.`)
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
