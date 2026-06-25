'use strict';
// Run: node --test lib/task-link.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const link = require('./task-link.js');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-link-'));
  fs.mkdirSync(path.join(root, '.git')); // make findRepoRoot resolve here
  return root;
}

test('migrate: defaults all v2 fields on a v1 object, idempotently', () => {
  const v1 = { source: 'github', type: 'gh-issues', taskId: '42', taskTitle: 'X', status: 'in-progress', history: [{ at: '2026-01-01', status: 'in-progress' }] };
  const m = link.migrate(v1);
  assert.equal(m.v, 2);
  assert.equal(m.assignee, '');
  assert.equal(m.branch, '');
  assert.deepEqual(m.specPr, { url: '', number: 0, mergedSha: '' });
  assert.deepEqual(m.codePr, { url: '', number: 0, mergedSha: '' });
  assert.equal(m.changelogRef, '');
  assert.equal(m.archivePath, '');
  assert.equal(m.history.length, 1); // untouched
  // idempotent
  assert.deepEqual(link.migrate(m), m);
});

test('migrate: returns null for non-objects', () => {
  assert.equal(link.migrate(null), null);
  assert.equal(link.migrate('x'), null);
  assert.equal(link.migrate([1, 2]), null);
});

test('read/write: round-trip, tolerant of missing/garbage, trailing newline', () => {
  const root = tmpRepo();
  assert.equal(link.read('c0001-x', root), null); // missing -> null

  const obj = link.migrate({ source: 'github', type: 'gh-issues', taskId: '7', taskTitle: 'T', status: 'in-progress', history: [] });
  const p = link.write('c0001-x', obj, root);
  assert.ok(fs.readFileSync(p, 'utf8').endsWith('}\n')); // pretty + trailing newline
  assert.deepEqual(link.read('c0001-x', root), obj);

  fs.writeFileSync(p, '{ not json');
  assert.equal(link.read('c0001-x', root), null); // garbage -> null
});

test('setRefs: shallow merge; specPr/codePr merge field-by-field', () => {
  const o = link.migrate({ taskId: '1', history: [] });
  link.setRefs(o, { branch: 'feat/c0001-x', specPr: { url: 'u', number: 12 } });
  assert.equal(o.branch, 'feat/c0001-x');
  assert.deepEqual(o.specPr, { url: 'u', number: 12, mergedSha: '' });
  // partial patch keeps url/number
  link.setRefs(o, { specPr: { mergedSha: 'abc123' } });
  assert.deepEqual(o.specPr, { url: 'u', number: 12, mergedSha: 'abc123' });
  // null values are ignored
  link.setRefs(o, { branch: null });
  assert.equal(o.branch, 'feat/c0001-x');
});

test('appendHistory: pushes entries', () => {
  const o = link.migrate({ taskId: '1', history: [] });
  link.appendHistory(o, { at: '2026-01-02', event: 'after-spec-pr-opened', ref: 'https://x/pull/12' });
  assert.equal(o.history.length, 1);
  assert.equal(o.history[0].event, 'after-spec-pr-opened');
});
