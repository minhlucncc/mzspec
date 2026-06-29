'use strict';
// Run: node --test lifecycle.test.js  (needs discover.js + run-hook.js co-located — vendored layout)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fireLifecycle, renderComment, EVENTS } = require('./lifecycle.js');
const link = require('./github-link.js');

const CHANGE = 'c0007-add-login';
const ISSUE = 90;

// A fake GitHub source — records calls, returns a defaulted issue. Lets us assert
// fireLifecycle's orchestration without `gh` or the network.
class FakeSource {
  constructor({ assignee } = {}) {
    this.assignee = assignee || '';
    this.comments = [];
    this.statuses = [];
    this.assigned = [];
  }
  async get(n) { return { number: n, assignee: this.assignee, title: 'Add login', url: 'https://x/issues/' + n }; }
  async comment(n, text) { this.comments.push({ n, text }); return { id: String(n), commented: true }; }
  async setStatus(n, s) { this.statuses.push({ n, s }); return { id: String(n), status: s }; }
  async setAssignee(n, who) { this.assigned.push({ n, who }); return { id: String(n), assignee: who }; }
}

function seedRepo({ issueNumber = ISSUE } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-lc-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'openspec', 'changes', CHANGE), { recursive: true });
  fs.writeFileSync(path.join(root, 'openspec', 'changes', CHANGE, 'github.json'),
    JSON.stringify(link.migrate({ change: CHANGE, issue: { number: issueNumber, url: 'https://x/issues/' + issueNumber, title: 'Add login' }, status: 'in-progress', history: [] }), null, 2) + '\n');
  return root;
}
function readLink(root) { return link.read(CHANGE, root); }

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

test('full lifecycle across all events mutates github.json + comments + status + assignee', async () => {
  const root = seedRepo();
  const src = new FakeSource();
  const fire = (event, ctx) => fireLifecycle(event, ctx, { startDir: root, source: src });

  let r = await fire('before-spec', { change: CHANGE, date: '2026-06-25' });
  assert.equal(r.ok, true); assert.equal(r.did.commented, true); assert.equal(r.did.linkWritten, true);
  assert.match(src.comments.at(-1).text, /Spec started/);
  assert.equal(readLink(root).history.at(-1).event, 'before-spec');

  r = await fire('after-spec-pr-opened', { change: CHANGE, branch: 'spec/' + CHANGE, specPr: { url: 'https://x/pull/4', number: 4 } });
  let gh = readLink(root);
  assert.equal(gh.status, 'in-review');
  assert.deepEqual(gh.specPr, { url: 'https://x/pull/4', number: 4, mergedSha: '' });
  assert.deepEqual(src.statuses.at(-1), { n: ISSUE, s: 'in-review' });
  assert.match(src.comments.at(-1).text, /Spec PR opened/);

  r = await fire('after-spec-pr-merged', { change: CHANGE, specPr: { mergedSha: 'abc1234' } });
  gh = readLink(root);
  assert.deepEqual(gh.specPr, { url: 'https://x/pull/4', number: 4, mergedSha: 'abc1234' });

  r = await fire('before-ship', { change: CHANGE, branch: 'feat/' + CHANGE });
  assert.equal(readLink(root).branch, 'feat/' + CHANGE);
  assert.match(src.comments.at(-1).text, /Implementation starting/);

  r = await fire('after-code-pr-opened', { change: CHANGE, branch: 'feat/' + CHANGE, codePr: { url: 'https://x/pull/9', number: 9 }, specPr: { number: 4 }, changelogRef: '- add login (c0007)' });
  assert.equal(r.did.assigneeSet, true);
  assert.deepEqual(src.assigned.at(-1), { n: ISSUE, who: '@me' });
  gh = readLink(root);
  assert.equal(gh.assignee, '@me');
  assert.deepEqual(gh.codePr, { url: 'https://x/pull/9', number: 9, mergedSha: '' });
  assert.match(src.comments.at(-1).text, /Code PR opened/);

  r = await fire('after-code-pr-merged', { change: CHANGE, codePr: { number: 9, mergedSha: 'def5678' }, archivePath: 'openspec/changes/archive/2026-06-25-' + CHANGE });
  gh = readLink(root);
  assert.equal(gh.status, 'done');
  assert.equal(gh.codePr.mergedSha, 'def5678');
  assert.equal(gh.archivePath, 'openspec/changes/archive/2026-06-25-' + CHANGE);
  assert.match(src.comments.at(-1).text, /Merged/);
  // every event left a history entry, in order
  assert.deepEqual(readLink(root).history.map((h) => h.event), EVENTS);
});

test('assign is skipped when the issue already has an assignee', async () => {
  const root = seedRepo();
  const src = new FakeSource({ assignee: 'someone' });
  const r = await fireLifecycle('after-code-pr-opened', { change: CHANGE, codePr: { url: 'u', number: 1 } }, { startDir: root, source: src });
  assert.equal(r.did.assigneeSet, false);
  assert.equal(src.assigned.length, 0);
});

test('no github.json -> no-op', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-lc-'));
  fs.mkdirSync(path.join(root, '.git'));
  const r = await fireLifecycle('before-spec', { change: 'c9999-none' }, { startDir: root, source: new FakeSource() });
  assert.equal(r.skipped, 'no-link');
});

test('--dry-run computes payload/patch and writes nothing', async () => {
  const root = seedRepo();
  const before = fs.readFileSync(path.join(root, 'openspec', 'changes', CHANGE, 'github.json'), 'utf8');
  const src = new FakeSource();
  const r = await fireLifecycle('after-code-pr-opened', { change: CHANGE, codePr: { url: 'https://x/pull/9', number: 9 } }, { startDir: root, source: src, dryRun: true });
  assert.equal(r.dryRun, true);
  assert.match(r.comment, /Code PR opened/);
  assert.equal(r.statusTo, 'in-review');
  assert.equal(r.assignTo, '@me');
  assert.equal(src.comments.length, 0); // nothing posted
  assert.equal(fs.readFileSync(path.join(root, 'openspec', 'changes', CHANGE, 'github.json'), 'utf8'), before); // unchanged
});

test('no bound issue -> link-only, SSOT still updated, error recorded', async () => {
  const root = seedRepo({ issueNumber: 0 });
  const r = await fireLifecycle('after-spec-pr-opened', { change: CHANGE, specPr: { url: 'u', number: 2 } }, { startDir: root, source: null });
  assert.equal(r.ok, true);
  assert.ok(r.errors.some((e) => /no-github-issue/.test(e)));
  assert.equal(readLink(root).specPr.number, 2); // SSOT still updated
});

test('executable on-<event> hook runs and merges its JSON; a failing hook is ignored', async () => {
  const root = seedRepo();
  const src = new FakeSource();
  const hookDir = path.join(root, 'openspec', 'hooks');
  fs.mkdirSync(hookDir, { recursive: true });
  const ok = path.join(hookDir, 'on-before-spec');
  fs.writeFileSync(ok, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({extra:"pinged"}))\n');
  fs.chmodSync(ok, 0o755);
  let r = await fireLifecycle('before-spec', { change: CHANGE }, { startDir: root, source: src });
  assert.equal(r.did.hookRan, true);
  assert.deepEqual(r.extra, { extra: 'pinged' });

  const bad = path.join(hookDir, 'on-before-ship');
  fs.writeFileSync(bad, '#!/usr/bin/env node\nprocess.exit(3)\n');
  fs.chmodSync(bad, 0o755);
  r = await fireLifecycle('before-ship', { change: CHANGE, branch: 'feat/x' }, { startDir: root, source: src });
  assert.equal(r.ok, true);
  assert.equal(r.did.hookRan, false);
  assert.ok(r.errors.some((e) => /hook on-before-ship/.test(e)));
});
