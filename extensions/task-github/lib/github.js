'use strict';
/*
 * github — the GitHub Issues adapter for the task-github extension.
 *
 * Extracted from the multi-source gh-issues.js: the per-source name/config
 * abstraction is gone — there is exactly one backend (GitHub via the `gh` CLI)
 * and the repo is inferred from `origin` (overridable for tests). It is the only
 * task API task-github speaks; lifecycle.js calls it directly.
 *
 * Normalized status vocabulary: todo | in-progress | in-review | done.
 * Status mapping (normalized -> gh) tokens: "+label"/"-label" (issue edit
 * add/remove label), "state:closed" (gh issue close), "state:open" (reopen).
 */

const { run, runJson } = require('./exec.js');
const { inferGithubRepo, findRepoRoot } = require('./discover.js');

const DEFAULT_MAP = {
  // Labels only for the open states (no surprise reopen of an already-open issue);
  // configure "state:open" if you want done -> reopen behaviour.
  todo: ['-in-progress', '-in-review'],
  'in-progress': ['+in-progress', '-in-review'],
  'in-review': ['+in-review', '-in-progress'],
  done: ['state:closed'],
};

class Github {
  // opts: { repo?, bin?, statusMap?, startDir? }
  constructor(opts = {}) {
    this._repo = opts.repo || process.env.GH_REPO || '';
    this.bin = opts.bin || process.env.GH_BIN || 'gh';
    this.statusMap = opts.statusMap || DEFAULT_MAP;
    this.startDir = opts.startDir || process.cwd();
  }

  // Resolve owner/repo lazily: explicit value wins, else infer from `origin`.
  get repo() {
    if (!this._repo) {
      this._repo = inferGithubRepo(findRepoRoot(this.startDir)) || '';
      if (!this._repo) throw new Error('github: cannot resolve repo — set a GitHub `origin` remote (or pass repo)');
    }
    return this._repo;
  }

  _repoArgs() {
    return ['--repo', this.repo];
  }

  _toTask(o) {
    const state = (o.state || '').toLowerCase();
    const labelNames = (o.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    let status = 'todo';
    if (state === 'closed') status = 'done';
    else if (labelNames.includes('in-review')) status = 'in-review';
    else if (labelNames.includes('in-progress')) status = 'in-progress';
    return {
      number: Number(o.number) || 0,
      id: String(o.number),
      title: o.title || '',
      body: o.body || '',
      status,
      labels: labelNames,
      assignee: (o.assignees && o.assignees[0] && o.assignees[0].login) || '',
      url: o.url || '',
    };
  }

  async list({ status, label, limit = 50 } = {}) {
    const args = ['issue', 'list', ...this._repoArgs(), '--state', 'open',
      '--json', 'number,title,body,labels,assignees,url,state', '--limit', String(limit)];
    if (label) args.push('--label', label);
    const items = runJson(this.bin, args) || [];
    let tasks = items.map((o) => this._toTask(o));
    if (status) tasks = tasks.filter((t) => t.status === status);
    return tasks;
  }

  async get(id) {
    const args = ['issue', 'view', String(id), ...this._repoArgs(),
      '--json', 'number,title,body,labels,assignees,url,state'];
    const o = runJson(this.bin, args);
    if (!o) throw new Error(`github: issue ${id} not found`);
    return this._toTask(o);
  }

  async setStatus(id, status) {
    const tokens = this.statusMap[status];
    if (!tokens) throw new Error(`github: no status mapping for "${status}"`);
    const editFlags = [];
    for (const tok of tokens) {
      if (tok === 'state:closed') run(this.bin, ['issue', 'close', String(id), ...this._repoArgs()]);
      else if (tok === 'state:open') run(this.bin, ['issue', 'reopen', String(id), ...this._repoArgs()]);
      else if (tok.startsWith('+')) editFlags.push('--add-label', tok.slice(1));
      else if (tok.startsWith('-')) editFlags.push('--remove-label', tok.slice(1));
    }
    if (editFlags.length) run(this.bin, ['issue', 'edit', String(id), ...this._repoArgs(), ...editFlags]);
    return { id: String(id), status };
  }

  async comment(id, text) {
    run(this.bin, ['issue', 'comment', String(id), ...this._repoArgs(), '--body-file', '-'], { input: String(text || '') });
    return { id: String(id), commented: true };
  }

  // Assign the issue. `login` may be a username or `@me` (gh resolves it to the
  // authenticated user). An empty login clears all current assignees. Idempotent.
  async setAssignee(id, login) {
    const who = String(login || '');
    if (!who) {
      const o = runJson(this.bin, ['issue', 'view', String(id), ...this._repoArgs(), '--json', 'assignees']);
      const cur = ((o && o.assignees) || []).map((a) => a.login).filter(Boolean);
      if (cur.length) {
        const flags = [];
        for (const l of cur) flags.push('--remove-assignee', l);
        run(this.bin, ['issue', 'edit', String(id), ...this._repoArgs(), ...flags]);
      }
      return { id: String(id), assignee: '' };
    }
    run(this.bin, ['issue', 'edit', String(id), ...this._repoArgs(), '--add-assignee', who]);
    return { id: String(id), assignee: who };
  }
}

// ---- CLI -----------------------------------------------------------------------
// The deterministic surface the task-github commands + propose-gh workflow drive,
// the same way ship-code drives gate-resolver.js. Repo is inferred from `origin`.
//
//   node github.js get <id> [--json]
//   node github.js list [--status S] [--label L] [--json]
//   node github.js comment <id> [--text T]      (reads stdin when --text is absent)
//   node github.js set-status <id> <status>
//   node github.js set-assignee <id> <login>     (login may be @me; empty clears)
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const verb = a._[0];
  const gh = new Github({});
  let res;
  switch (verb) {
    case 'get':
      if (!a._[1]) throw new Error('usage: github.js get <id>');
      res = await gh.get(a._[1]);
      break;
    case 'list':
      res = await gh.list({ status: a.status && a.status !== true ? a.status : undefined, label: a.label && a.label !== true ? a.label : undefined });
      break;
    case 'comment': {
      if (!a._[1]) throw new Error('usage: github.js comment <id> [--text T]');
      let text = a.text && a.text !== true ? a.text : '';
      if (!text) { try { text = require('fs').readFileSync(0, 'utf8'); } catch { text = ''; } }
      res = await gh.comment(a._[1], text);
      break;
    }
    case 'set-status':
      if (!a._[1] || !a._[2]) throw new Error('usage: github.js set-status <id> <status>');
      res = await gh.setStatus(a._[1], a._[2]);
      break;
    case 'set-assignee':
      if (!a._[1]) throw new Error('usage: github.js set-assignee <id> <login>');
      res = await gh.setAssignee(a._[1], a._[2] || '');
      break;
    default:
      process.stderr.write('usage: github.js <get|list|comment|set-status|set-assignee> …\n');
      process.exit(2);
  }
  process.stdout.write(JSON.stringify(res, null, a.json ? 2 : 0) + '\n');
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write('github: ' + (e && e.message ? e.message : String(e)) + '\n'); process.exit(1); });
}

module.exports = { Github, DEFAULT_MAP };
