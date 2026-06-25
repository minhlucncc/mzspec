#!/usr/bin/env node
'use strict';
/*
 * lifecycle — wire a backlog ticket to the change as it moves through the pipeline.
 *
 * The ship/spec workflows are agent-driven (their JS never shells out), so this is a
 * deterministic CLI the agents invoke, the same way they call task-sources/cli.js and
 * gate-resolver.js:
 *
 *   node .claude/workflows/lib/lifecycle.js <event> --change <c> [refs…] [--dry-run] [--json]
 *
 * For each event it reads openspec/changes/<c>/.task-link.json (the SSOT). If the change
 * isn't linked to a ticket it no-ops. Otherwise it COMMENTS the ticket (the same
 * source.comment() path /opsx:task-log uses), advances status, assigns at ship time, and
 * records the spec/code PR + branch + changelog + archive refs back into the link. Then,
 * if openspec/hooks/on-<event> is executable, it runs it with the full context on stdin so
 * a project can extend/notify. EVERY step is best-effort — it must never fail the ship.
 */

const taskLink = require('./task-link.js');
const { runHook } = require('./run-hook.js');

const EVENTS = [
  'before-spec',
  'after-spec-pr-opened',
  'after-spec-pr-merged',
  'before-ship',
  'after-code-pr-opened',
  'after-code-pr-merged',
];

// ---- comment templates ---------------------------------------------------------
// Pure: given the context, return the exact ticket comment. Lines with missing refs
// are omitted. Tested directly (and shown by --dry-run) so the payload is asserted
// without posting anything.
function renderComment(event, ctx) {
  const c = ctx || {};
  const spec = c.specPr || {};
  const code = c.codePr || {};
  const lines = [];
  switch (event) {
    case 'before-spec':
      lines.push(`🟢 **Spec started** for this ticket → change \`${c.change}\`.`);
      break;
    case 'after-spec-pr-opened':
      lines.push(`📋 **Spec PR opened** — ${spec.url}${spec.number ? ` (#${spec.number})` : ''}`);
      lines.push(`The contract for \`${c.change}\` is up for review; merging it locks the spec.`);
      if (c.branch) lines.push(`Branch: \`${c.branch}\``);
      break;
    case 'after-spec-pr-merged':
      lines.push(`✅ **Spec merged**${spec.mergedSha ? ` (\`${spec.mergedSha}\`)` : ''} — contract locked. Implementation starting.`);
      if (spec.url) lines.push(`Spec PR: ${spec.url}${spec.number ? ` (#${spec.number})` : ''}`);
      break;
    case 'before-ship':
      lines.push(`🚀 **Implementation starting** for \`${c.change}\`${c.branch ? ` (branch \`${c.branch}\`)` : ''}.`);
      break;
    case 'after-code-pr-opened':
      lines.push(`🔧 **Code PR opened** — ${code.url}${code.number ? ` (#${code.number})` : ''}`);
      lines.push(`Implements${spec.number ? ` the merged spec PR #${spec.number}` : ' the merged spec'} for \`${c.change}\`.`);
      if (c.changelogRef) lines.push(`CHANGELOG: ${c.changelogRef}`);
      if (c.branch) lines.push(`Branch: \`${c.branch}\``);
      break;
    case 'after-code-pr-merged': {
      lines.push(`🎉 **Merged**${code.mergedSha ? ` (\`${code.mergedSha}\`)` : ''} — \`${c.change}\` shipped${c.archivePath ? ' & archived' : ''}.`);
      const trace = [c.taskId ? `ticket #${c.taskId}` : '', spec.number ? `spec PR #${spec.number}` : '', code.number ? `code PR #${code.number}` : ''].filter(Boolean);
      if (trace.length) lines.push(`Traceability: ${trace.join(' → ')}`);
      if (c.archivePath) lines.push(`Archive: ${c.archivePath}`);
      break;
    }
    default:
      lines.push(`mzspec lifecycle: ${event} for \`${c.change}\`.`);
  }
  lines.push('');
  lines.push(`— mzspec lifecycle (${event})`);
  return lines.filter((l) => l != null).join('\n');
}

// ---- per-event link mutation + status -----------------------------------------
// Returns { status?: <normalized>, refs: {...} } describing the SSOT change. Status
// is what to write to the backend; refs are merged into .task-link.json.
function planMutation(event, ctx) {
  const c = ctx || {};
  switch (event) {
    case 'before-spec':
      return { refs: {} };
    case 'after-spec-pr-opened':
      return { status: 'in-review', refs: { specPr: c.specPr, branch: c.branch } };
    case 'after-spec-pr-merged':
      return { refs: { specPr: c.specPr } };
    case 'before-ship':
      return { refs: { branch: c.branch } };
    case 'after-code-pr-opened':
      return { status: 'in-review', refs: { codePr: c.codePr, branch: c.branch, changelogRef: c.changelogRef } };
    case 'after-code-pr-merged':
      return { status: 'done', refs: { codePr: c.codePr, archivePath: c.archivePath } };
    default:
      return { refs: {} };
  }
}

// Drop empty/zero ref fields so we never overwrite real data with blanks.
function cleanRefs(refs) {
  const out = {};
  for (const k of Object.keys(refs || {})) {
    const v = refs[k];
    if (v == null || v === '') continue;
    if (k === 'specPr' || k === 'codePr') {
      const pr = {};
      if (v.url) pr.url = v.url;
      if (v.number) pr.number = v.number;
      if (v.mergedSha) pr.mergedSha = v.mergedSha;
      if (Object.keys(pr).length) out[k] = pr;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveSourceSafe(config, name, startDir) {
  try {
    const { resolveSource } = require('./task-sources/index.js');
    return resolveSource(config, name, { cwd: startDir });
  } catch {
    return null;
  }
}

// fireLifecycle(event, ctx, { startDir, config, dryRun, assignee })
// ctx: { change, date?, branch?, specPr?, codePr?, changelogRef?, archivePath? }
async function fireLifecycle(event, ctx, opts = {}) {
  const o = opts || {};
  const startDir = o.startDir || process.cwd();
  const errors = [];
  const did = { commented: false, statusSet: false, assigneeSet: false, linkWritten: false, hookRan: false };

  if (!EVENTS.includes(event)) throw new Error(`unknown lifecycle event: ${event} (expected one of ${EVENTS.join(', ')})`);
  const change = ctx && ctx.change;
  if (!change) throw new Error('lifecycle requires --change');

  let link = taskLink.read(change, startDir);
  if (!link) return { ok: true, skipped: 'no-link', event, change, did, errors };

  const mut = planMutation(event, ctx);
  const refs = cleanRefs(mut.refs);
  const fullCtx = { event, change, date: ctx.date || '', taskId: link.taskId, task: null, link, refs, ...ctx };

  // Resolve the adapter (degrade to link-only if task-sources/config are absent).
  let resolved = null;
  if (o.config !== null) {
    let config = o.config;
    if (!config) { try { config = require('./load-config.js').loadConfig(startDir); } catch { config = {}; } }
    resolved = resolveSourceSafe(config, link.source, startDir);
  }
  const source = resolved && resolved.source;

  // Read the current ticket (for the assignee guard); best-effort.
  let task = null;
  if (source) { try { task = await source.get(link.taskId); fullCtx.task = task; } catch (e) { errors.push(`get: ${e.message}`); } }

  const comment = renderComment(event, fullCtx);
  const assignWho = o.assignee == null ? '@me' : o.assignee;
  const wantAssign = event === 'after-code-pr-opened' && assignWho && assignWho !== 'none' && !(task && task.assignee);

  if (o.dryRun) {
    return { ok: true, dryRun: true, event, change, taskId: link.taskId, comment, statusTo: mut.status || null, assignTo: wantAssign ? assignWho : null, refs, did, errors };
  }

  if (source) {
    try { await source.comment(link.taskId, comment); did.commented = true; } catch (e) { errors.push(`comment: ${e.message}`); }
    if (mut.status) { try { await source.setStatus(link.taskId, mut.status); did.statusSet = true; } catch (e) { errors.push(`setStatus: ${e.message}`); } }
    if (wantAssign && typeof source.setAssignee === 'function') {
      try { const r = await source.setAssignee(link.taskId, assignWho); did.assigneeSet = true; refs.assignee = r.assignee || assignWho; } catch (e) { errors.push(`setAssignee: ${e.message}`); }
    }
  } else {
    errors.push('no-task-source: link-only (comment/status/assignee skipped)');
  }

  // Update the SSOT regardless of adapter outcome.
  if (mut.status) link.status = mut.status;
  taskLink.setRefs(link, refs);
  taskLink.appendHistory(link, { at: ctx.date || '', event, ...(mut.status ? { status: mut.status } : {}), ...(refs.specPr || refs.codePr ? { ref: (refs.specPr && refs.specPr.url) || (refs.codePr && refs.codePr.url) || '' } : {}) });
  try { taskLink.write(change, link, startDir); did.linkWritten = true; } catch (e) { errors.push(`link-write: ${e.message}`); }

  // Optional project hook (best-effort; non-zero/parse-fail is logged + ignored).
  let extra = null;
  try {
    const out = runHook(`on-${event}`, JSON.stringify({ ...fullCtx, comment }) + '\n', startDir);
    if (out) { did.hookRan = true; extra = out; }
  } catch (e) { errors.push(`hook on-${event}: ${e.message}`); }

  return { ok: true, event, change, taskId: link.taskId, did, refs, ...(extra ? { extra } : {}), errors };
}

// ---- CLI -----------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

function ctxFromArgs(a) {
  let changelogRef = a['changelog-ref'];
  if (changelogRef === true || changelogRef == null) {
    try { const s = require('fs').readFileSync(0, 'utf8').trim(); if (s) changelogRef = s; else changelogRef = ''; } catch { changelogRef = ''; }
  }
  return {
    change: a.change,
    date: a.date && a.date !== true ? a.date : '',
    branch: a.branch && a.branch !== true ? a.branch : '',
    specPr: { url: a['spec-pr'] && a['spec-pr'] !== true ? a['spec-pr'] : '', number: Number(a['spec-pr-number']) || 0, mergedSha: a['merged-sha'] && a['merged-sha'] !== true ? a['merged-sha'] : '' },
    codePr: { url: a['code-pr'] && a['code-pr'] !== true ? a['code-pr'] : '', number: Number(a['code-pr-number']) || 0, mergedSha: a['merged-sha'] && a['merged-sha'] !== true ? a['merged-sha'] : '' },
    changelogRef: typeof changelogRef === 'string' ? changelogRef : '',
    archivePath: a['archive-path'] && a['archive-path'] !== true ? a['archive-path'] : '',
  };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const event = a._[0];
  if (!event) { process.stderr.write(`usage: lifecycle.js <${EVENTS.join('|')}> --change <c> [refs…] [--dry-run] [--json]\n`); process.exit(2); }
  // merged-sha goes to whichever PR this event is about, so both specPr/codePr carry it harmlessly.
  const ctx = ctxFromArgs(a);
  const res = await fireLifecycle(event, ctx, { dryRun: !!a.dryRun, assignee: a.assignee && a.assignee !== true ? a.assignee : undefined });
  process.stdout.write(JSON.stringify(res, null, 2) + '\n');
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write('lifecycle: ' + (e && e.message ? e.message : String(e)) + '\n'); process.exit(1); });
}

module.exports = { EVENTS, renderComment, planMutation, cleanRefs, fireLifecycle };
