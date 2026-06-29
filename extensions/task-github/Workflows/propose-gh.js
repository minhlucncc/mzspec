export const meta = {
  name: 'propose-gh',
  description:
    'Start an OpenSpec change FROM a GitHub issue and bind the two together. Fetches the issue via the task-github CLI (node .claude/workflows/lib/github.js get <n>), writes it to .github/issues/<n>/task.md (the local TASK.md handoff), then delegates scaffolding to the core `propose` workflow which reads that file. After scaffolding it writes openspec/changes/<change>/github.json linking the issue, copies TASK.md into the change dir, flips the issue to in-progress, and fires the before-spec lifecycle event. This is the GitHub adapter of the decoupled pattern: propose never knows about GitHub — the adapter converts the issue into a local file that propose reads.',
  phases: [
    { title: 'Resolve', detail: 'fetch the GitHub issue (github.js get)' },
    { title: 'Scaffold', detail: 'write .github/issues/<n>/task.md → delegate to core propose workflow' },
    { title: 'Link', detail: 'write github.json, copy TASK.md into change, flip issue → in-progress, fire before-spec' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
const issue = A.issue != null ? String(A.issue) : '' // #N, N, or an issue URL
const date = A.date // YYYY-MM-DD passed in (Date.now() unavailable in scripts)

if (!issue) throw new Error('propose-gh requires args { issue: "<#N|N|url>", date? }')
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Unsafe date (expected YYYY-MM-DD): ' + date)
// Accept "#90", "90", or a github issue URL; extract the trailing number for the CLI.
const issueNum = (issue.match(/(\d+)\s*$/) || [])[1] || ''
if (!issueNum) throw new Error('propose-gh: could not parse an issue number from "' + issue + '"')

const GH = 'node .claude/workflows/lib/github.js'
const LINK = 'node .claude/workflows/lib/github-link.js'

// ---------------------------------------------------------------- schemas
const RESOLVE = {
  type: 'object', additionalProperties: false, required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    number: { type: 'integer' }, title: { type: 'string' }, body: { type: 'string' }, url: { type: 'string' },
  },
}
const WRITE_TASK = {
  type: 'object', additionalProperties: false, required: ['ok'],
  properties: {
    ok: { type: 'boolean' }, path: { type: 'string' }, reason: { type: 'string' },
  },
}
const LINKR = {
  type: 'object', additionalProperties: false, required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    linked: { type: 'boolean' }, taskMdCopied: { type: 'boolean' },
    inProgress: { type: 'boolean' }, beforeSpec: { type: 'boolean' },
  },
}

// ================================================================ Resolve
phase('Resolve')
const iss = await agent(
  [
    `Fetch GitHub issue #${issueNum} for the task-github propose flow. Use Bash.`,
    `Run: ${GH} get ${issueNum} --json — parse the returned JSON { number, title, body, url }.`,
    `If the issue cannot be fetched (not found, no gh auth, no origin), return ok:false with the reason and STOP.`,
    `Return ok, reason, number, title, body, url. (Keep title+body for the next phase.)`,
  ].join('\n'),
  { schema: RESOLVE, label: 'gh-get', phase: 'Resolve', agentType: 'general-purpose' },
)
if (!iss || !iss.ok) return { stage: 'resolve', ok: false, reason: iss ? iss.reason : 'resolve agent returned null', issue: issueNum }

// ================================================================ Scaffold (write TASK.md → delegate to propose)
phase('Scaffold')
const TASK_DIR = `.github/issues/${iss.number}`
const TASK_FILE = `${TASK_DIR}/task.md`

// Write the GitHub issue to a local TASK.md — the file-based handoff to propose.
// Propose never knows about GitHub; it just reads this local file.
const taskWritten = await agent(
  [
    `Write the fetched GitHub issue to ${TASK_FILE} as a local task file for the propose workflow to consume. Use Bash.`,
    `1. mkdir -p ${TASK_DIR}`,
    `2. Write the file using cat with a heredoc:`,
    `   cat > ${TASK_FILE} << 'TASKEOF'`,
    `# ${iss.title}`,
    ``,
    `${iss.body || ''}`,
    ``,
    `---`,
    `_source: github-issue`,
    `_issue: ${iss.number}`,
    `_url: ${iss.url}`,
    `TASKEOF`,
    `3. Verify the file exists (wc -l ${TASK_FILE})`,
    `Return ok:true, path:"${TASK_FILE}".`,
  ].join('\n'),
  { schema: WRITE_TASK, label: 'write-task-md', phase: 'Scaffold', agentType: 'general-purpose' },
)
if (!taskWritten || !taskWritten.ok) {
  return { stage: 'write-task', ok: false, reason: taskWritten ? taskWritten.reason : 'write-task agent returned null', issue: issueNum }
}

// Delegate scaffolding to the core propose workflow — it reads from the local TASK.md.
// The prompt is a meta-instruction pointing to the file; the file carries the content.
const scaffolded = await workflow('propose', {
  prompt: `Read the task from ${TASK_FILE} and scaffold a new OpenSpec change from it. Base the proposal on what you read. Keep it faithful to the task description.`,
  title: iss.title,
  date,
})
if (!scaffolded || !scaffolded.ok || !scaffolded.change) {
  return { stage: 'scaffold', ok: false, reason: scaffolded ? (scaffolded.reason || 'propose did not return a change') : 'propose returned null', issue: issueNum }
}
const change = scaffolded.change

// ================================================================ Link
phase('Link')
const linked = await agent(
  [
    `Bind OpenSpec change "${change}" to GitHub issue #${iss.number}, copy the local TASK.md into the change dir for traceability, flip the issue to in-progress, and fire the before-spec lifecycle. Use Bash. BEST-EFFORT after the link write — never fail the whole flow once the link exists.`,
    `1. Write the link (SSOT): ${LINK} link "${change}" --issue-number ${iss.number} --issue-url ${JSON.stringify(iss.url)} --issue-title ${JSON.stringify(iss.title)} --status in-progress${date ? ` --at ${date}` : ''}. This creates openspec/changes/${change}/github.json. If it fails, return ok:false.`,
    `2. Copy TASK.md into the change dir for traceability: cp ${TASK_FILE} openspec/changes/${change}/TASK.md. On error, log and CONTINUE (set taskMdCopied:false).`,
    `3. Clean up the staging file: rm -f ${TASK_FILE} && rmdir ${TASK_DIR} 2>/dev/null || true.`,
    `4. Flip the issue to in-progress on GitHub: ${GH} set-status ${iss.number} in-progress. On error, log and CONTINUE (set inProgress:false).`,
    `5. Fire the before-spec lifecycle event (posts "spec started" on the issue): node .claude/workflows/lib/lifecycle.js before-spec --change "${change}"${date ? ` --date ${date}` : ''}. On error, log and CONTINUE (set beforeSpec:false).`,
    `Return ok, reason, linked, taskMdCopied, inProgress, beforeSpec.`,
  ].join('\n'),
  { schema: LINKR, label: 'gh-link', phase: 'Link', agentType: 'general-purpose' },
)
if (!linked || !linked.ok) return { stage: 'link', ok: false, reason: linked ? linked.reason : 'link agent returned null', issue: issueNum, change }

return {
  stage: 'done', ok: true, issue: issueNum, issueNumber: iss.number, change,
  proposalPath: scaffolded.proposalPath || null,
  nextStep: `Linked issue #${iss.number} → change ${change} (issue marked in-progress). Review/refine proposal.md, then run /opsx:spec ${change}.`,
}
