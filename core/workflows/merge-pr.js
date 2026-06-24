export const meta = {
  name: 'merge-pr',
  description:
    'Team-lead PR merge workflow. Given an OpenSpec change slug or a PR URL, it preflights (PR status, linked issues, changelog), optionally updates the title/body/closing keywords, merges the PR via GitHub, closes linked issues, posts a cross-reference comment on each closed issue — then reports the merge SHA and next steps. Never creates a local merge — everything happens via the GitHub API. Honors dryRun (show what it would do; no merge/close).',
  phases: [
    { title: 'Preflight', detail: 'find PR, check status, detect linked issues, check changelog' },
    { title: 'Prepare',   detail: 'update PR title/body/closing keywords if needed' },
    { title: 'Merge',     detail: 'merge PR via GitHub API, close issues, post linking comments' },
    { title: 'Summary',   detail: 'report merge SHA, closed issues, PR URL' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
const change = A.change           // optional: OpenSpec change slug
const pr = A.pr                   // optional: explicit PR URL/number (overrides change)
const dryRun = !!A.dryRun
const strategy = A.strategy || 'squash'  // squash | merge | rebase
const title = A.title || ''       // override PR title (empty = keep existing)
const body = A.body || ''         // override/append PR body (empty = keep existing)
const repo = A.repo || ''         // optional: "owner/repo" for cross-repo PRs (auto-detected from URL)
const closes = A.closes || ''     // explicit "Closes #N" to add (empty = auto-detect from existing PR)
const base = A.base || 'main'
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

const branch = change ? `feat/${change}` : null
let prNumber, prUrl, owner, repo

// ---------------------------------------------------------------- Phase 1: Preflight
phase('Preflight')
const PRE = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'reason', 'prNumber', 'prUrl', 'owner', 'repo', 'state', 'isDraft', 'mergeable', 'headSha', 'baseRef', 'title', 'body', 'closingIssues', 'changelogEntry'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    prNumber: { type: 'integer' }, prUrl: { type: 'string' },
    owner: { type: 'string' }, repo: { type: 'string' },
    state: { type: 'string' }, isDraft: { type: 'boolean' },
    mergeable: { type: ['string', 'null'] },
    headSha: { type: 'string' }, baseRef: { type: 'string' },
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
    `4. Extract: prNumber, prUrl, state, isDraft, mergeable, headSha(headRefOid), baseRef(baseRefName), title, body, closingIssues (list of issue numbers from closingIssuesReferences. If closingIssuesReferences API is empty, check the body for "Closes #N" / "Fixes #N" patterns).`,
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

// ---------------------------------------------------------------- Phase 3: Merge
phase('Merge')
if (budget && budget.total && budget.remaining() < reserve) {
  return { stage: 'merge', ok: false, reason: 'budget reserve reached before merge', prUrl, prNumber }
}

const mergeResult = await agent(
  [
    `Merge PR #${prNumber} in ${owner}/${repo} using ${strategy} merge strategy.`,
    `Head SHA: ${pre.headSha}`,
    `Title: "${finalTitle}"`,
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
    `4. If no linked issues were detected but the PR was linked via "Closes #N" in the body:`,
    `   - Parse the body for "Closes #N" / "Fixes #N" patterns`,
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

// ---------------------------------------------------------------- Phase 4: Summary
phase('Summary')
if (!mergeResult || !mergeResult.merged) {
  return {
    stage: 'merge-failed', ok: false, prUrl, prNumber,
    error: mergeResult ? mergeResult.error : 'merge agent returned null',
    nextStep: `Merge failed for PR #${prNumber}. Resolve the issue and retry.`,
  }
}

const issuesClosed = mergeResult.issuesClosed || []
return {
  stage: 'done', ok: true,
  prUrl, prNumber,
  mergeSha: mergeResult.mergeSha,
  mergeStrategy: strategy,
  headSha: pre.headSha,
  titleUpdated: needsUpdate,
  issuesClosed,
  changelogPresent: !!pre.changelogEntry,
  prTitle: finalTitle,
  nextStep: [
    `✅ Merged PR #${prNumber} (${strategy}) — commit \`${mergeResult.mergeSha}\``,
    issuesClosed.length ? `   Closed issue(s): #${issuesClosed.join(', #')}` : '   No linked issues to close.',
    `   PR: ${prUrl}`,
    ``,
    `**Post-merge actions for lead:**`,
    change ? `- Run /opsx:archive ${change} to archive the completed change.` : '',
    !pre.changelogEntry && change ? `- Consider adding a CHANGELOG entry for ${change}.` : '',
  ].filter(Boolean).join('\n'),
}
