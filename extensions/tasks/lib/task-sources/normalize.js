'use strict';
/*
 * normalize — shared helpers for task-source adapters.
 *
 * Every adapter (local-folder, gh-issues, mello) normalizes its backend to the
 * same Task shape and the same status vocabulary, so the /opsx:task workflow can
 * treat all sources uniformly (mirroring how gate-resolver normalizes toolchains).
 *
 *   Task = { id, title, body, status, labels, assignee, url, source }
 *   status ∈ STATUSES = ['todo','in-progress','in-review','done']
 */

const STATUSES = ['todo', 'in-progress', 'in-review', 'done'];

function isStatus(s) {
  return STATUSES.includes(s);
}

// kebab-case slug from a task title, for the cNNNN-<slug> change name.
function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '') || 'task';
}

// A complete, defaulted Task from a partial — adapters build on this so the shape
// is uniform and JSON output is predictable.
function makeTask(partial) {
  const t = partial || {};
  return {
    id: t.id != null ? String(t.id) : '',
    title: t.title != null ? String(t.title) : '',
    body: t.body != null ? String(t.body) : '',
    status: isStatus(t.status) ? t.status : 'todo',
    labels: Array.isArray(t.labels) ? t.labels.map(String) : [],
    assignee: t.assignee != null ? String(t.assignee) : '',
    url: t.url != null ? String(t.url) : '',
    source: t.source != null ? String(t.source) : '',
  };
}

// ---- minimal YAML-ish frontmatter (no external deps) ---------------------------
// Supports `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines.
// Sufficient for task.md frontmatter; not a general YAML parser.

function parseFrontmatter(text) {
  const src = String(text || '');
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  const lines = m[1].split('\n');
  let listKey = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li && listKey) {
      data[listKey].push(stripQuotes(li[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (val === '') {
      data[key] = [];
      listKey = key;
    } else if (/^\[.*\]$/.test(val)) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s !== '');
      listKey = null;
    } else {
      data[key] = stripQuotes(val);
      listKey = null;
    }
  }
  return { data, body: m[2] };
}

function stripQuotes(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function serializeFrontmatter(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => String(x)).join(', ')}]`);
    } else {
      lines.push(`${k}: ${v == null ? '' : String(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + (body ? String(body).replace(/^\n+/, '') : '');
}

module.exports = {
  STATUSES,
  isStatus,
  slugify,
  makeTask,
  parseFrontmatter,
  serializeFrontmatter,
  stripQuotes,
};
