'use strict';
// Run: node --test lib/task-sources/index.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveSource, pickSourceEntry } = require('./index.js');
const { LocalFolderSource } = require('./local-folder.js');
const { GhIssuesSource } = require('./gh-issues.js');
const { MelloSource } = require('./mello.js');
const { slugify, parseFrontmatter } = require('./normalize.js');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-tasks-'));
}

// Write an executable Node stub CLI that records argv to CAPTURE_FILE and echoes
// canned JSON from env. Used in place of `gh` / `mello`.
function writeStub(dir) {
  const p = path.join(dir, 'stub-cli.js');
  fs.writeFileSync(
    p,
    `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);
if(process.env.CAPTURE_FILE)fs.appendFileSync(process.env.CAPTURE_FILE,JSON.stringify(a)+"\\n");
const sub=a[0]+' '+a[1];
if(sub==='issue list'||sub==='ticket list')process.stdout.write(process.env.LIST_JSON||'[]');
else if(sub==='issue view'||sub==='ticket view')process.stdout.write(process.env.VIEW_JSON||'{}');
else if(sub==='issue create')process.stdout.write(process.env.CREATE_OUT||'');
else if(sub==='ticket create')process.stdout.write(process.env.CREATE_JSON||'{}');
`
  );
  fs.chmodSync(p, 0o755);
  return p;
}

// ---- local-folder ---------------------------------------------------------------

test('local-folder: round-trip list -> setStatus -> comment', async () => {
  const root = tmpdir();
  const taskDir = path.join(root, '.tasks', 'T-001-add-login');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, 'task.md'),
    `---\nid: T-001-add-login\ntitle: Add login\nstatus: todo\nlabels: [auth, p1]\n---\nAs a user I want to log in.\n`
  );
  const src = new LocalFolderSource({ name: 'local', config: { path: '.tasks' } }, { cwd: root });

  const tasks = await src.list({});
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].id, 'T-001-add-login');
  assert.strictEqual(tasks[0].title, 'Add login');
  assert.strictEqual(tasks[0].status, 'todo');
  assert.deepStrictEqual(tasks[0].labels, ['auth', 'p1']);
  assert.match(tasks[0].body, /log in/);

  await src.setStatus('T-001-add-login', 'in-progress');
  const after = await src.get('T-001-add-login');
  assert.strictEqual(after.status, 'in-progress');
  // frontmatter actually rewritten
  const fm = parseFrontmatter(fs.readFileSync(path.join(taskDir, 'task.md'), 'utf8'));
  assert.strictEqual(fm.data.status, 'in-progress');
  assert.match(fm.body, /log in/); // body preserved

  await src.comment('T-001-add-login', 'spec drafted as c0007-add-login');
  const cfile = path.join(taskDir, 'comments', '001-mzspec.md');
  assert.ok(fs.existsSync(cfile));
  assert.match(fs.readFileSync(cfile, 'utf8'), /spec drafted/);

  // status filter
  assert.strictEqual((await src.list({ status: 'todo' })).length, 0);
  assert.strictEqual((await src.list({ status: 'in-progress' })).length, 1);
});

test('local-folder: create authors a new T-NNN-<slug> task as todo', async () => {
  const root = tmpdir();
  const src = new LocalFolderSource({ name: 'local', config: { path: '.tasks' } }, { cwd: root });
  const t1 = await src.create({ title: 'Add OAuth login', body: 'Support Google SSO.', labels: ['auth'] });
  assert.match(t1.id, /^T-001-add-oauth-login$/);
  assert.strictEqual(t1.status, 'todo');
  assert.match(t1.body, /Google SSO/);
  // second create increments the ordinal
  const t2 = await src.create({ title: 'Add logout' });
  assert.match(t2.id, /^T-002-add-logout$/);
  // both visible via list, as todo (pullable)
  const todo = await src.list({ status: 'todo' });
  assert.deepStrictEqual(todo.map((t) => t.id).sort(), ['T-001-add-oauth-login', 'T-002-add-logout']);
  // missing title rejected
  await assert.rejects(() => src.create({ body: 'x' }), /requires a title/);
});

// ---- resolver -------------------------------------------------------------------

test('resolver: picks by name and falls back to first enabled', () => {
  const config = {
    taskSources: [
      { name: 'local', type: 'local-folder', enabled: false, config: { path: '.tasks' } },
      { name: 'github', type: 'gh-issues', enabled: true, config: { repo: 'o/r' } },
    ],
  };
  assert.strictEqual(pickSourceEntry(config, 'local').name, 'local'); // by name even if disabled
  assert.strictEqual(pickSourceEntry(config).name, 'github'); // first enabled
  const { source } = resolveSource(config, 'github');
  assert.ok(source instanceof GhIssuesSource);
  const { source: loc } = resolveSource(config, 'local');
  assert.ok(loc instanceof LocalFolderSource);
});

test('resolver: clear error when no sources / unknown type', () => {
  assert.throws(() => pickSourceEntry({ taskSources: [] }), /no taskSources/);
  assert.throws(
    () => resolveSource({ taskSources: [{ name: 'x', type: 'jira' }] }, 'x'),
    /unknown task source type/
  );
});

// ---- gh-issues (stub CLI) -------------------------------------------------------

test('gh-issues: parses list + builds expected argv for setStatus/comment', async () => {
  const dir = tmpdir();
  const bin = writeStub(dir);
  const capture = path.join(dir, 'argv.log');
  process.env.CAPTURE_FILE = capture;
  process.env.LIST_JSON = JSON.stringify([
    { number: 42, title: 'Fix bug', body: 'boom', state: 'open', labels: [{ name: 'in-progress' }], assignees: [{ login: 'alice' }], url: 'https://x/42' },
  ]);
  const src = new GhIssuesSource({ name: 'github', config: { repo: 'o/r', label: 'backlog' } }, { bin });

  const tasks = await src.list({});
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].id, '42');
  assert.strictEqual(tasks[0].status, 'in-progress'); // derived from label
  assert.strictEqual(tasks[0].assignee, 'alice');

  await src.setStatus('42', 'done'); // -> issue close
  await src.comment('42', 'PR opened');
  const lines = fs.readFileSync(capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // list used --repo and --label
  assert.ok(lines[0].includes('list') && lines[0].includes('--repo') && lines[0].includes('backlog'));
  // done closed the issue
  assert.ok(lines.some((a) => a[0] === 'issue' && a[1] === 'close' && a.includes('42')));
  // comment via --body-file -
  assert.ok(lines.some((a) => a[0] === 'issue' && a[1] === 'comment' && a.includes('--body-file')));

  // create parses the printed issue URL -> number
  process.env.CREATE_OUT = 'https://github.com/o/r/issues/77\n';
  const created = await src.create({ title: 'New thing', body: 'do it', labels: ['p2'] });
  assert.strictEqual(created.id, '77');
  assert.strictEqual(created.url, 'https://github.com/o/r/issues/77');
  const lines2 = fs.readFileSync(capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines2.some((a) => a[0] === 'issue' && a[1] === 'create' && a.includes('--title') && a.includes('--label')));
  delete process.env.CAPTURE_FILE; delete process.env.LIST_JSON; delete process.env.CREATE_OUT;
});

// ---- mello (stub CLI) -----------------------------------------------------------

test('mello: parses list + builds move/comment argv', async () => {
  const dir = tmpdir();
  const bin = writeStub(dir);
  const capture = path.join(dir, 'argv.log');
  process.env.CAPTURE_FILE = capture;
  process.env.LIST_JSON = JSON.stringify([
    { id: 'M-1', title: 'Ship it', description: 'do', column: 'Todo', labels: ['x'], assignee: 'bob' },
  ]);
  const src = new MelloSource({ name: 'mello', config: { board: 'B1' } }, { bin });

  const tasks = await src.list({});
  assert.strictEqual(tasks[0].id, 'M-1');
  assert.strictEqual(tasks[0].status, 'todo'); // column Todo -> todo

  await src.setStatus('M-1', 'in-progress'); // -> ticket move --column "In Progress"
  await src.comment('M-1', 'note');
  const lines = fs.readFileSync(capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((a) => a[0] === 'ticket' && a[1] === 'move' && a.includes('In Progress')));
  assert.ok(lines.some((a) => a[0] === 'comment' && a[1] === 'add'));

  // create lands in the backlog column and parses the JSON ticket
  process.env.CREATE_JSON = JSON.stringify({ id: 'M-9', title: 'New', column: 'Todo' });
  const created = await src.create({ title: 'New', body: 'do' });
  assert.strictEqual(created.id, 'M-9');
  assert.strictEqual(created.status, 'todo');
  const lines2 = fs.readFileSync(capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines2.some((a) => a[0] === 'ticket' && a[1] === 'create' && a.includes('-c') && a.includes('Todo')));
  delete process.env.CAPTURE_FILE; delete process.env.LIST_JSON; delete process.env.CREATE_JSON;
});

// ---- normalize ------------------------------------------------------------------

test('slugify produces clean kebab for change names', () => {
  assert.strictEqual(slugify('Add OAuth login (Google)!'), 'add-oauth-login-google');
  assert.strictEqual(slugify(''), 'task');
});
