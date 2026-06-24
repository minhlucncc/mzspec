export const meta = {
  name: 'task',
  description:
    'Drive the task backlog from a configured task source (local-folder | gh-issues | mello-cli). Dispatched by args.action: "pull" selects the next open task (or --id; --list just prints the backlog), creates an OpenSpec change cNNNN-<slug>, seeds proposal.md from the task body, flips the task to in-progress, and writes the task<->change link; "push" syncs the linked change\'s current lifecycle status back to the task (proposal->in-progress, open PR->in-review, archived->done, or --status); "log" adds a comment to the linked task. All backend calls go through the task-sources CLI (.claude/workflows/lib/task-sources/cli.js), the same way ship-code calls gate-resolver.js.',
  phases: [
    { title: 'Resolve', detail: 'load config, resolve task source, fetch the task / link' },
    { title: 'Apply', detail: 'create change + seed proposal / set status / comment' },
  ],
}

// ---------------------------------------------------------------- args & safety
let A = typeof args === 'string' ? JSON.parse(args) : args
A = A || {}
const action = A.action
const source = A.source // optional task-source name; defaults to first enabled
const id = A.id // optional explicit task id
const status = A.status // optional explicit status for push
const text = A.text // comment body for log
const list = A.list === true
const date = A.date // YYYY-MM-DD passed in (Date.now() unavailable in scripts)

if (!['pull', 'push', 'log'].includes(action)) {
  throw new Error('task requires args { action: "pull"|"push"|"log", ... }; got action=' + action)
}
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Unsafe date (expected YYYY-MM-DD): ' + date)
const CLI = 'node .claude/workflows/lib/task-sources/cli.js'
const srcFlag = source ? ` --source ${source}` : ''

// ---------------------------------------------------------------- schemas
const PULL = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    taskId: { type: 'string' },
    taskTitle: { type: 'string' },
    change: { type: 'string', description: 'the created cNNNN-<slug> change name' },
    proposalPath: { type: ['string', 'null'] },
    backlog: { type: 'array', items: { type: 'object' }, description: 'only when --list' },
  },
}
const SIMPLE = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' }, reason: { type: 'string' },
    taskId: { type: 'string' }, status: { type: 'string' }, change: { type: 'string' },
  },
}

// ================================================================ PULL
if (action === 'pull') {
  phase('Resolve')
  if (list) {
    const r = await agent(
      `List the backlog from the task source. Run: ${CLI} list${srcFlag} --json  — then return ok:true and the parsed tasks as "backlog" (array of {id,title,status}). Do not create anything.`,
      { schema: PULL, label: 'task-list', phase: 'Resolve', agentType: 'general-purpose' },
    )
    if (!r) return { stage: 'list', ok: false, reason: 'list agent returned null' }
    return { stage: 'list', ok: true, action, backlog: r.backlog || [], nextStep: 'Backlog listed. Run /opsx:task-pull (without --list) to pull one.' }
  }

  const pre = await agent(
    [
      `Select the task to work next from the configured task source. Use Bash.`,
      id
        ? `1. Fetch the specified task: ${CLI} get ${id}${srcFlag} --json`
        : `1. Fetch the next open task: ${CLI} next${srcFlag} --json  (returns { task: {id,title,body,...} | null }).`,
      `2. If there is no task (null/empty), return ok:false with a reason and STOP.`,
      `Return ok, reason, taskId, taskTitle. (Keep the task body for the next phase — you will read it again there.)`,
    ].join('\n'),
    { schema: PULL, label: 'task-next', phase: 'Resolve', agentType: 'general-purpose' },
  )
  if (!pre || !pre.ok) return { stage: 'resolve', ok: false, reason: pre ? pre.reason : 'resolve agent returned null', action }

  phase('Apply')
  const made = await agent(
    [
      `Create an OpenSpec change seeded from task "${pre.taskId}" ("${pre.taskTitle}") and link them. Use Bash. Apply ${`the \`openspec-propose\` skill`} for the numbering + scaffolding conventions.`,
      `1. Re-read the task: ${CLI} get ${pre.taskId}${srcFlag} --json — keep its title + body.`,
      `2. Compute the next change name: the next cNNNN ordinal (ls -1d openspec/changes/c[0-9]* | sed -E 's#.*/c([0-9]+).*#\\1#' | sort -n | tail -1, then +1, zero-padded to 4) and a kebab slug of the title. Name = "cNNNN-<slug>".`,
      `3. Create it: openspec new change "cNNNN-<slug>".`,
      `4. Seed proposal.md from the task: get the proposal artifact path (openspec instructions proposal --change "cNNNN-<slug>" --json) and write a proposal whose "## What/## Why" are grounded in the task title + body. Keep it faithful to the task text; do not invent scope.`,
      `5. Flip the task to in-progress: ${CLI} set-status ${pre.taskId} in-progress${srcFlag}.`,
      `6. Write the link files (machine-readable):`,
      `   - openspec/changes/cNNNN-<slug>/.task-link.json = { "source": "<source name>", "type": "<type>", "taskId": "${pre.taskId}", "taskTitle": "${pre.taskTitle}", "status": "in-progress", "history": [ { "at": "${date || ''}", "status": "in-progress" } ] }`,
      `   - For a local-folder source ONLY, also write <task-folder>/.link.json = { "change": "cNNNN-<slug>", "status": "in-progress", "history": [ { "at": "${date || ''}", "status": "in-progress" } ] } (the task folder is the task's url/dir).`,
      `Return ok, reason, taskId, taskTitle, change (the cNNNN-<slug>), proposalPath.`,
    ].join('\n'),
    { schema: PULL, label: 'task-pull-create', phase: 'Apply', agentType: 'general-purpose' },
  )
  if (!made || !made.ok) return { stage: 'apply', ok: false, reason: made ? made.reason : 'create agent returned null', action, taskId: pre.taskId }
  return {
    stage: 'done', ok: true, action, taskId: made.taskId, taskTitle: made.taskTitle, change: made.change,
    proposalPath: made.proposalPath || null,
    nextStep: `Pulled task ${made.taskId} → change ${made.change} (task marked in-progress). Review/refine proposal.md, then run /opsx:spec ${made.change}.`,
  }
}

// ================================================================ PUSH
if (action === 'push') {
  phase('Resolve')
  const r = await agent(
    [
      `Push the linked change's status back to its task source. Use Bash.`,
      A.change
        ? `1. Read openspec/changes/${A.change}/.task-link.json for { source, type, taskId }.`
        : id
          ? `1. The task id is "${id}"; determine its source from the configured task sources (or --source).`
          : `1. Find the change for the current branch (feat/<change>) and read openspec/changes/<change>/.task-link.json for { source, type, taskId }. If none, return ok:false.`,
      status
        ? `2. Target status = "${status}".`
        : `2. Derive the target status from the change's lifecycle: if archived under openspec/changes/archive → "done"; else if an open PR exists for feat/<change> (gh pr view feat/<change> --json state) → "in-review"; else if proposal.md exists → "in-progress".`,
      `3. Apply it: ${CLI} set-status <taskId> <status>${srcFlag}.`,
      `4. Append { at: "${date || ''}", status } to the .task-link.json history (and the local-folder .link.json if applicable).`,
      `Return ok, reason, taskId, status, change.`,
    ].join('\n'),
    { schema: SIMPLE, label: 'task-push', phase: 'Resolve', agentType: 'general-purpose' },
  )
  if (!r || !r.ok) return { stage: 'push', ok: false, reason: r ? r.reason : 'push agent returned null', action }
  return { stage: 'done', ok: true, action, taskId: r.taskId, status: r.status, change: r.change, nextStep: `Pushed status "${r.status}" to task ${r.taskId}.` }
}

// ================================================================ LOG
if (action === 'log') {
  phase('Apply')
  const r = await agent(
    [
      `Add a comment to the linked task. Use Bash.`,
      id ? `Task id: "${id}".` : `Resolve the task id from the current change's .task-link.json (feat/<change>).`,
      `Comment body: ${JSON.stringify(text || '')}. Pipe it via stdin: printf '%s' <body> | ${CLI} comment <taskId>${srcFlag}`,
      `Return ok, reason, taskId.`,
    ].join('\n'),
    { schema: SIMPLE, label: 'task-log', phase: 'Apply', agentType: 'general-purpose' },
  )
  if (!r || !r.ok) return { stage: 'log', ok: false, reason: r ? r.reason : 'log agent returned null', action }
  return { stage: 'done', ok: true, action, taskId: r.taskId, nextStep: `Comment added to task ${r.taskId}.` }
}
