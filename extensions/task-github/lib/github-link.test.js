'use strict';
// Run: node --test github-link.test.js  (needs discover.js co-located — vendored layout)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const link = require('./github-link.js');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-ghlink-'));
  fs.mkdirSync(path.join(root, '.git')); // make findRepoRoot resolve here
  return root;
}

test('migrate: defaults all v1 fields, idempotently', () => {
  const partial = { change: 'c0007-x', issue: { number: 90, url: 'https://x/issues/90' }, status: 'in-progress', history: [{ at: '2026-01-01', status: 'in-progress' }] };
  const m = link.migrate(partial);
  assert.equal(m.v, 1);
  assert.deepEqual(m.issue, { number: 90, url: 'https://x/issues/90', title: '' });
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

  const obj = link.migrate({ change: 'c0001-x', issue: { number: 7, url: 'u' }, status: 'in-progress', history: [] });
  const p = link.write('c0001-x', obj, root);
  assert.ok(p.endsWith(path.join('openspec', 'changes', 'c0001-x', 'github.json')));
  assert.ok(fs.readFileSync(p, 'utf8').endsWith('}\n')); // pretty + trailing newline
  assert.deepEqual(link.read('c0001-x', root), obj);

  fs.writeFileSync(p, '{ not json');
  assert.equal(link.read('c0001-x', root), null); // garbage -> null
});

test('setRefs: shallow merge; specPr/codePr/issue merge field-by-field', () => {
  const o = link.migrate({ change: 'c0001-x', history: [] });
  link.setRefs(o, { branch: 'feat/c0001-x', specPr: { url: 'u', number: 12 } });
  assert.equal(o.branch, 'feat/c0001-x');
  assert.deepEqual(o.specPr, { url: 'u', number: 12, mergedSha: '' });
  // partial patch keeps url/number
  link.setRefs(o, { specPr: { mergedSha: 'abc123' } });
  assert.deepEqual(o.specPr, { url: 'u', number: 12, mergedSha: 'abc123' });
  // issue merges field-by-field
  link.setRefs(o, { issue: { title: 'T' } });
  assert.deepEqual(o.issue, { number: 0, url: '', title: 'T' });
  // null values are ignored
  link.setRefs(o, { branch: null });
  assert.equal(o.branch, 'feat/c0001-x');
});

test('appendHistory: pushes entries', () => {
  const o = link.migrate({ change: 'c0001-x', history: [] });
  link.appendHistory(o, { at: '2026-01-02', event: 'after-spec-pr-opened', ref: 'https://x/pull/12' });
  assert.equal(o.history.length, 1);
  assert.equal(o.history[0].event, 'after-spec-pr-opened');
});
