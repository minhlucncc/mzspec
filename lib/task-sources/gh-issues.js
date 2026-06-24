'use strict';
/*
 * gh-issues task source — GitHub Issues via the `gh` CLI.
 *
 * Status mapping (normalized -> gh) is configurable via taskStatusMap['gh-issues'];
 * tokens: "+label" (--add-label), "-label" (--remove-label), "state:closed"
 * (gh issue close), "state:open" (gh issue reopen). Defaults below.
 *
 * config: { repo: "owner/repo", label?: "backlog", limit?: 50 }
 */

const { run, runJson } = require('./exec.js');
const { makeTask } = require('./normalize.js');

const DEFAULT_MAP = {
  // Labels only for the open states (no surprise reopen of an already-open issue);
  // configure "state:open" in taskStatusMap if you want done -> reopen behaviour.
  todo: ['-in-progress', '-in-review'],
  'in-progress': ['+in-progress', '-in-review'],
  'in-review': ['+in-review', '-in-progress'],
  done: ['state:closed'],
};

class GhIssuesSource {
  constructor(cfg, opts = {}) {
    this.name = (cfg && cfg.name) || 'github';
    const c = (cfg && cfg.config) || {};
    this.repo = c.repo || '';
    this.label = c.label || '';
    this.limit = c.limit || 50;
    this.bin = opts.bin || process.env.GH_BIN || 'gh';
    this.statusMap = (opts.statusMap && opts.statusMap['gh-issues']) || DEFAULT_MAP;
  }

  _repoArgs() {
    return this.repo ? ['--repo', this.repo] : [];
  }

  _toTask(o) {
    const state = (o.state || '').toLowerCase();
    const labelNames = (o.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    let status = 'todo';
    if (state === 'closed') status = 'done';
    else if (labelNames.includes('in-review')) status = 'in-review';
    else if (labelNames.includes('in-progress')) status = 'in-progress';
    return makeTask({
      id: String(o.number),
      title: o.title,
      body: o.body || '',
      status,
      labels: labelNames,
      assignee: (o.assignees && o.assignees[0] && o.assignees[0].login) || '',
      url: o.url || '',
      source: this.name,
    });
  }

  async list({ status } = {}) {
    const args = ['issue', 'list', ...this._repoArgs(), '--state', 'open',
      '--json', 'number,title,body,labels,assignees,url,state', '--limit', String(this.limit)];
    if (this.label) args.push('--label', this.label);
    const items = runJson(this.bin, args) || [];
    let tasks = items.map((o) => this._toTask(o));
    if (status) tasks = tasks.filter((t) => t.status === status);
    return tasks;
  }

  async get(id) {
    const args = ['issue', 'view', String(id), ...this._repoArgs(),
      '--json', 'number,title,body,labels,assignees,url,state'];
    const o = runJson(this.bin, args);
    if (!o) throw new Error(`gh-issues: issue ${id} not found`);
    return this._toTask(o);
  }

  async setStatus(id, status) {
    const tokens = this.statusMap[status];
    if (!tokens) throw new Error(`gh-issues: no status mapping for "${status}"`);
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
}

module.exports = { GhIssuesSource, DEFAULT_MAP };
