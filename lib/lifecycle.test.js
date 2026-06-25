'use strict';
// Run: node --test lib/lifecycle.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fireLifecycle, renderComment, EVENTS } = require('./lifecycle.js');
const taskLink = require('./task-link.js');

const CHANGE = 'c0007-add-login';
const TASK = 'T-001-add-login';
const CONFIG = { taskSources: [{ name: 'local', type: 'local-folder', enabled: true, config: { path: '.tasks' } }] };

function seedRepo({ assignee } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-lc-'));
  fs.mkdirSync(path.join(root, '.git'));
  // a local-folder task
  const taskDir = path.join(root, '.tasks', TASK);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'),
    `---\nid: ${TASK}\ntitle: Add login\nstatus: in-progress\n${assignee ? `assignee: ${assignee}\n` : ''}---\nAs a user I want to log in.\n`);
  // the change -> ticket link (v1 shape)
  fs.mkdirSync(path.join(root, 'openspec', 'changes', CHANGE), { recursive: true });
  fs.writeFileSync(path.join(root, 'openspec', 'changes', CHANGE, '.task-link.json'),
    JSON.stringify({ source: 'local', type: 'local-folder', taskId: TASK, taskTitle: 'Add login', status: 'in-progress', history: [] }, null, 2));
  return root;
}

function readLink(root) { return taskLink.read(CHANGE, root); }
function latestComment(root) {
  const cdir = path.join(root, '.tasks', TASK, 'comments');
  const files = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter((f) => f.endsWith('.md')).sort() : [];
  return files.length ? fs.readFileSync(path.join(cdir, files[files.length - 1]), 'utf8') : '';
}
function frontmatter(root) {
  const { parseFrontmatter } = require('./task-sources/normalize.js');
  return parseFrontmatter(fs.readFileSync(path.join(root, '.tasks', TASK, 'task.md'), 'utf8')).data;
}

test('renderComment: exact payload for after-code-pr-opened', () => {
  const txt = renderComment('after-code-pr-opened', { change: CHANGE, codePr: { url: 'https://x/pull/9', number: 9 }, specPr: { number: 4 }, changelogRef: '- add login (c0007)', branch: 'feat/c0007-add-login' });
  assert.equal(txt,
    '🔧 **Code PR opened** — https://x/pull/9 (#9)\n' +
    'Implements the merged spec PR #4 for `c0007-add-login`.\n' +
    'CHANGELOG: - add login (c0007)\n' +
    'Branch: `feat/c0007-add-login`\n' +
    '\n' +
    '— mzspec lifecycle (after-code-pr-opened)');
});

test('full lifecycle across all events mutates the link + comments + status + assignee', async () => {
  const root = seedRepo();

  // before-spec
  let r = await fireLifecycle('before-spec', { change: CHANGE, date: '2026-06-25' }, { startDir: root, config: CONFIG });
  assert.equal(r.ok, true); assert.equal(r.did.commented, true); assert.equal(r.did.linkWritten, true);
  assert.match(latestComment(root), /Spec started/);
  assert.equal(readLink(root).history.at(-1).event, 'before-spec');

  // after-spec-pr-opened -> in-review + specPr recorded
  r = await fireLifecycle('after-spec-pr-opened', { change: CHANGE, branch: 'spec/' + CHANGE, specPr: { url: 'https://x/pull/4', number: 4 } }, { startDir: root, config: CONFIG });
  let link = readLink(root);
  assert.equal(link.status, 'in-review');
  assert.deepEqual(link.specPr, { url: 'https://x/pull/4', number: 4, mergedSha: '' });
  assert.equal(frontmatter(root).status, 'in-review');
  assert.match(latestComment(root), /Spec PR opened/);

  // after-spec-pr-merged -> mergedSha recorded (url/number preserved)
  r = await fireLifecycle('after-spec-pr-merged', { change: CHANGE, specPr: { mergedSha: 'abc1234' } }, { startDir: root, config: CONFIG });
  link = readLink(root);
  assert.deepEqual(link.specPr, { url: 'https://x/pull/4', number: 4, mergedSha: 'abc1234' });

  // before-ship -> branch recorded
  r = await fireLifecycle('before-ship', { change: CHANGE, branch: 'feat/' + CHANGE }, { startDir: root, config: CONFIG });
  assert.equal(readLink(root).branch, 'feat/' + CHANGE);
  assert.match(latestComment(root), /Implementation starting/);

  // after-code-pr-opened -> assign @me + codePr + in-review
  r = await fireLifecycle('after-code-pr-opened', { change: CHANGE, branch: 'feat/' + CHANGE, codePr: { url: 'https://x/pull/9', number: 9 }, specPr: { number: 4 }, changelogRef: '- add login (c0007)' }, { startDir: root, config: CONFIG });
  assert.equal(r.did.assigneeSet, true);
  assert.equal(frontmatter(root).assignee, '@me');
  link = readLink(root);
  assert.deepEqual(link.codePr, { url: 'https://x/pull/9', number: 9, mergedSha: '' });
  assert.match(latestComment(root), /Code PR opened/);

  // after-code-pr-merged -> done + mergedSha + archive
  r = await fireLifecycle('after-code-pr-merged', { change: CHANGE, codePr: { number: 9, mergedSha: 'def5678' }, archivePath: 'openspec/changes/archive/2026-06-25-' + CHANGE }, { startDir: root, config: CONFIG });
  link = readLink(root);
  assert.equal(link.status, 'done');
  assert.equal(link.codePr.mergedSha, 'def5678');
  assert.equal(link.archivePath, 'openspec/changes/archive/2026-06-25-' + CHANGE);
  assert.equal(frontmatter(root).status, 'done');
  assert.match(latestComment(root), /Merged/);
  // every event left a history entry
  assert.deepEqual(readLink(root).history.map((h) => h.event), EVENTS);
});

test('assign is skipped when the ticket already has an assignee', async () => {
  const root = seedRepo({ assignee: 'someone' });
  const r = await fireLifecycle('after-code-pr-opened', { change: CHANGE, codePr: { url: 'u', number: 1 } }, { startDir: root, config: CONFIG });
  assert.equal(r.did.assigneeSet, false);
  assert.equal(frontmatter(root).assignee, 'someone'); // not clobbered
});

test('no .task-link.json -> no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-lc-'));
  fs.mkdirSync(path.join(root, '.git'));
  const r = await fireLifecycle('before-spec', { change: 'c9999-none' }, { startDir: root, config: CONFIG });
  assert.equal(r.skipped, 'no-link');
});

test('--dry-run computes payload/patch and writes nothing', async () => {
  const root = seedRepo();
  const before = fs.readFileSync(path.join(root, 'openspec', 'changes', CHANGE, '.task-link.json'), 'utf8');
  const r = await fireLifecycle('after-code-pr-opened', { change: CHANGE, codePr: { url: 'https://x/pull/9', number: 9 } }, { startDir: root, config: CONFIG, dryRun: true });
  assert.equal(r.dryRun, true);
  assert.match(r.comment, /Code PR opened/);
  assert.equal(r.statusTo, 'in-review');
  assert.equal(r.assignTo, '@me');
  assert.equal(fs.readFileSync(path.join(root, 'openspec', 'changes', CHANGE, '.task-link.json'), 'utf8'), before); // unchanged
  assert.equal(latestComment(root), ''); // no comment written
});

test('best-effort: missing task source -> link still written, error recorded', async () => {
  const root = seedRepo();
  const r = await fireLifecycle('after-spec-pr-opened', { change: CHANGE, specPr: { url: 'u', number: 2 } }, { startDir: root, config: {} });
  assert.equal(r.ok, true);
  assert.ok(r.errors.some((e) => /no-task-source/.test(e)));
  assert.equal(readLink(root).specPr.number, 2); // SSOT still updated
});

test('executable on-<event> hook runs and merges its JSON; a failing hook is ignored', async () => {
  const root = seedRepo();
  const hookDir = path.join(root, 'openspec', 'hooks');
  fs.mkdirSync(hookDir, { recursive: true });
  // a hook that echoes JSON
  const ok = path.join(hookDir, 'on-before-spec');
  fs.writeFileSync(ok, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({extra:"pinged"}))\n');
  fs.chmodSync(ok, 0o755);
  let r = await fireLifecycle('before-spec', { change: CHANGE }, { startDir: root, config: CONFIG });
  assert.equal(r.did.hookRan, true);
  assert.deepEqual(r.extra, { extra: 'pinged' });

  // a non-zero hook is logged + ignored (ok stays true)
  const bad = path.join(hookDir, 'on-before-ship');
  fs.writeFileSync(bad, '#!/usr/bin/env node\nprocess.exit(3)\n');
  fs.chmodSync(bad, 0o755);
  r = await fireLifecycle('before-ship', { change: CHANGE, branch: 'feat/x' }, { startDir: root, config: CONFIG });
  assert.equal(r.ok, true);
  assert.equal(r.did.hookRan, false);
  assert.ok(r.errors.some((e) => /hook on-before-ship/.test(e)));
});
