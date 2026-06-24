'use strict';
/*
 * local-folder task source — each task is a FOLDER under a configurable path
 * (default `.tasks/`, e.g. also `.github/projects/<proj>/tasks/`):
 *
 *   .tasks/
 *     T-001-add-login/
 *       task.md         # frontmatter (id,title,status,labels,assignee) + requirement body
 *       comments/       # NNN-<who>.md, appended by comment()
 *       .link.json      # { change, status, history } — written by the task workflow
 *
 * This is a first-class, offline source of truth (authored & committed in-repo).
 */

const fs = require('fs');
const path = require('path');
const { makeTask, parseFrontmatter, serializeFrontmatter, isStatus, slugify } = require('./normalize.js');

class LocalFolderSource {
  constructor(cfg, opts) {
    this.name = (cfg && cfg.name) || 'local';
    this.root = path.resolve((opts && opts.cwd) || process.cwd(), (cfg && cfg.config && cfg.config.path) || '.tasks');
  }

  _taskFile(id) {
    return path.join(this.root, id, 'task.md');
  }

  _readTaskDir(dir) {
    const file = path.join(this.root, dir, 'task.md');
    if (!fs.existsSync(file)) return null;
    const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    return makeTask({
      id: data.id || dir,
      title: data.title || dir,
      body: (body || '').trim(),
      status: data.status,
      labels: data.labels,
      assignee: data.assignee,
      url: file,
      source: this.name,
    });
  }

  async list({ status } = {}) {
    if (!fs.existsSync(this.root)) return [];
    const dirs = fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort(); // stable order → "top open task" is deterministic
    const tasks = [];
    for (const d of dirs) {
      const t = this._readTaskDir(d);
      if (!t) continue;
      if (status && t.status !== status) continue;
      tasks.push(t);
    }
    return tasks;
  }

  async get(id) {
    const t = this._readTaskDir(id);
    if (!t) throw new Error(`local-folder: no task "${id}" under ${this.root}`);
    return t;
  }

  async setStatus(id, status) {
    if (!isStatus(status)) throw new Error(`local-folder: invalid status "${status}"`);
    const file = this._taskFile(id);
    if (!fs.existsSync(file)) throw new Error(`local-folder: no task "${id}" under ${this.root}`);
    const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    data.id = data.id || id;
    data.status = status;
    fs.writeFileSync(file, serializeFrontmatter(data, body));
    return { id, status };
  }

  async create({ title, body, labels } = {}) {
    if (!title || !String(title).trim()) throw new Error('local-folder: create requires a title');
    fs.mkdirSync(this.root, { recursive: true });
    // id = T-<NNN>-<slug>, NNN = next ordinal across existing T-<NNN>-* folders.
    let max = 0;
    for (const d of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const m = d.name.match(/^T-(\d+)-/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const n = String(max + 1).padStart(3, '0');
    const id = `T-${n}-${slugify(title)}`;
    const dir = path.join(this.root, id);
    if (fs.existsSync(dir)) throw new Error(`local-folder: task "${id}" already exists`);
    fs.mkdirSync(dir, { recursive: true });
    const data = { id, title: String(title), status: 'todo' };
    if (Array.isArray(labels) && labels.length) data.labels = labels.map(String);
    fs.writeFileSync(path.join(dir, 'task.md'), serializeFrontmatter(data, (String(body || '').trim() + '\n')));
    return this.get(id);
  }

  async comment(id, text) {
    const dir = path.join(this.root, id);
    if (!fs.existsSync(path.join(dir, 'task.md'))) throw new Error(`local-folder: no task "${id}" under ${this.root}`);
    const cdir = path.join(dir, 'comments');
    fs.mkdirSync(cdir, { recursive: true });
    const n = String(fs.readdirSync(cdir).filter((f) => f.endsWith('.md')).length + 1).padStart(3, '0');
    const file = path.join(cdir, `${n}-mzspec.md`);
    fs.writeFileSync(file, String(text || '').trim() + '\n');
    return { id, comment: file };
  }
}

module.exports = { LocalFolderSource };
