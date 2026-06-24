'use strict';
// Run: node --test lib/templates.test.js
// Exercises the skill-like template CRUD + discovery against a temp templatesDir.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { list, get, create, remove, parseFrontmatter } = require('./templates.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-templates-'));
}

test('empty / missing dir → no templates (the common case)', () => {
  assert.deepStrictEqual(list(path.join(tmpDir(), 'nope')), []);
});

test('create → get round-trips name, description, body', () => {
  const dir = tmpDir();
  const made = create(dir, 'requirements', 'Distil an RFQ into requirements tasks', '# Requirements\n\nCover all sections.');
  assert.strictEqual(made.name, 'requirements');
  const got = get(dir, 'requirements');
  assert.strictEqual(got.description, 'Distil an RFQ into requirements tasks');
  assert.match(got.body, /Cover all sections\./);
  assert.ok(fs.existsSync(path.join(dir, 'requirements', 'TEMPLATE.md')));
});

test('create without a body scaffolds a placeholder guide', () => {
  const dir = tmpDir();
  create(dir, 'estimation', 'Plan estimation tasks', '');
  assert.match(get(dir, 'estimation').body, /planning guide/);
});

test('list returns name+description, sorted', () => {
  const dir = tmpDir();
  create(dir, 'proposal', 'b', 'x');
  create(dir, 'enrich', 'a', 'y');
  assert.deepStrictEqual(
    list(dir).map((t) => t.name),
    ['enrich', 'proposal']
  );
});

test('create refuses to clobber unless --force', () => {
  const dir = tmpDir();
  create(dir, 'prd', 'first', 'one');
  assert.throws(() => create(dir, 'prd', 'second', 'two'), /already exists/);
  const forced = create(dir, 'prd', 'second', 'two', true);
  assert.strictEqual(get(dir, forced.name).description, 'second');
});

test('create rejects a non-kebab name', () => {
  assert.throws(() => create(tmpDir(), 'Bad Name', 'd', 'b'), /kebab-case/);
});

test('remove deletes the template; get returns null after', () => {
  const dir = tmpDir();
  create(dir, 'translate', 'd', 'b');
  remove(dir, 'translate');
  assert.strictEqual(get(dir, 'translate'), null);
  assert.throws(() => remove(dir, 'translate'), /not found/);
});

test('parseFrontmatter tolerates a body with no frontmatter', () => {
  const { fm, body } = parseFrontmatter('# just a body\n');
  assert.deepStrictEqual(fm, {});
  assert.match(body, /just a body/);
});
