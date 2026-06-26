'use strict';
/*
 * mello task source — Mello tickets via the `mello` CLI
 * (github.com/minhlucncc/mello-cli).
 *
 * Normalized status maps to a board column via taskStatusMap['mello-cli'].columns
 * (default below); setStatus uses `mello ticket move --column`.
 *
 * config: { board: "<id>", column?: "Todo", limit?: 50 }
 */

const { run, runJson } = require('./exec.js');
const { makeTask } = require('./normalize.js');

const DEFAULT_COLUMNS = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  done: 'Done',
};

class MelloSource {
  constructor(cfg, opts = {}) {
    this.name = (cfg && cfg.name) || 'mello';
    const c = (cfg && cfg.config) || {};
    this.board = c.board || '';
    this.column = c.column || '';
    this.limit = c.limit || 50;
    this.bin = opts.bin || process.env.MELLO_BIN || 'mello';
    const map = (opts.statusMap && opts.statusMap['mello-cli']) || {};
    this.columns = map.columns || DEFAULT_COLUMNS;
    // reverse: column name -> normalized status
    this.statusOfColumn = {};
    for (const [s, col] of Object.entries(this.columns)) this.statusOfColumn[String(col).toLowerCase()] = s;
  }

  _toTask(o) {
    const col = o.column || '';
    const status = this.statusOfColumn[String(col).toLowerCase()] || 'todo';
    return makeTask({
      id: String(o.id || o.ticket_code || o.ticket || ''),
      title: o.title,
      body: o.body || o.description || '',
      status,
      labels: o.labels || [],
      assignee: o.assignee || '',
      url: o.url || '',
      source: this.name,
    });
  }

  async list({ status } = {}) {
    const args = ['ticket', 'list', '-b', this.board, '--json'];
    if (this.column) args.push('--column', this.column);
    const items = runJson(this.bin, args) || [];
    let tasks = items.map((o) => this._toTask(o));
    if (status) tasks = tasks.filter((t) => t.status === status);
    return tasks;
  }

  async get(id) {
    const o = runJson(this.bin, ['ticket', 'view', String(id), '--json']);
    if (!o) throw new Error(`mello: ticket ${id} not found`);
    return this._toTask(o);
  }

  async setStatus(id, status) {
    const col = this.columns[status];
    if (!col) throw new Error(`mello: no column mapping for status "${status}"`);
    run(this.bin, ['ticket', 'move', String(id), '--column', col]);
    return { id: String(id), status };
  }

  async create({ title, body, labels } = {}) {
    if (!title || !String(title).trim()) throw new Error('mello: create requires a title');
    // New tickets land in the configured backlog column (or "Todo").
    const col = this.column || this.columns.todo || 'Todo';
    const args = ['ticket', 'create', '-b', this.board, '-c', col, '-t', String(title), '--body-file', '-', '--json'];
    if (Array.isArray(labels) && labels.length) args.push('--labels', labels.join(','));
    const o = runJson(this.bin, args, { input: String(body || '') });
    if (!o) throw new Error('mello: create returned no JSON');
    return this._toTask(o);
  }

  async comment(id, text) {
    run(this.bin, ['comment', 'add', String(id), '--body-file', '-'], { input: String(text || '') });
    return { id: String(id), commented: true };
  }

  // `mello ticket assign <id> --user <login>` / `--unassign`. If the installed
  // mello-cli lacks this subcommand the call throws; the lifecycle dispatcher catches
  // it (best-effort) so a missing feature never breaks the ship.
  async setAssignee(id, login) {
    const args = login
      ? ['ticket', 'assign', String(id), '--user', String(login)]
      : ['ticket', 'assign', String(id), '--unassign'];
    run(this.bin, args);
    return { id: String(id), assignee: String(login || '') };
  }
}

module.exports = { MelloSource, DEFAULT_COLUMNS };
