#!/usr/bin/env node
'use strict';
/*
 * github-link — the single source of truth for openspec/changes/<change>/github.json.
 *
 * This replaces the old multi-source .task-link.json: there is exactly one backend
 * (GitHub), so the link carries the issue it is bound to plus the cross-references
 * the lifecycle dispatcher wires together as the change moves through the pipeline —
 * the assignee, the branch, the spec/code PRs, the CHANGELOG bullet, the archive path.
 *
 * `migrate()` defaults any missing field, so a partial / hand-written file still loads
 * and old readers keep working. A non-object reads as "no link" (null).
 */

const fs = require('fs');
const path = require('path');
const { findRepoRoot } = require('./discover.js');

const V = 1;

function linkPath(change, startDir) {
  const root = findRepoRoot(startDir || process.cwd());
  return path.join(root, 'openspec', 'changes', change, 'github.json');
}

function issueRef(x) {
  return { number: (x && Number(x.number)) || 0, url: (x && x.url) || '', title: (x && x.title) || '' };
}

function prRef(x) {
  return { url: (x && x.url) || '', number: (x && x.number) || 0, mergedSha: (x && x.mergedSha) || '' };
}

// Default any missing field to the full v1 shape. Never throws; returns null for
// non-objects so a garbage file reads as "no link".
function migrate(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = { ...obj };
  o.v = V;
  if (typeof o.change !== 'string') o.change = '';
  o.issue = issueRef(o.issue);
  if (typeof o.status !== 'string') o.status = 'todo';
  if (typeof o.assignee !== 'string') o.assignee = '';
  if (typeof o.branch !== 'string') o.branch = '';
  o.specPr = prRef(o.specPr);
  o.codePr = prRef(o.codePr);
  if (typeof o.changelogRef !== 'string') o.changelogRef = '';
  if (typeof o.archivePath !== 'string') o.archivePath = '';
  if (!Array.isArray(o.history)) o.history = [];
  return o;
}

// Tolerant read: returns the migrated object, or null when the file is missing/garbage.
function read(change, startDir) {
  try {
    return migrate(JSON.parse(fs.readFileSync(linkPath(change, startDir), 'utf8')));
  } catch {
    return null;
  }
}

function write(change, obj, startDir) {
  const p = linkPath(change, startDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
}

function appendHistory(obj, entry) {
  if (!Array.isArray(obj.history)) obj.history = [];
  obj.history.push(entry);
  return obj;
}

// Shallow-merge ref fields onto the link; specPr/codePr/issue merge field-by-field so a
// partial { mergedSha } patch keeps the existing url/number.
function setRefs(obj, patch) {
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v == null) continue;
    if ((k === 'specPr' || k === 'codePr') && typeof v === 'object') {
      obj[k] = { ...prRef(obj[k]), ...v };
    } else if (k === 'issue' && typeof v === 'object') {
      obj[k] = { ...issueRef(obj[k]), ...v };
    } else {
      obj[k] = v;
    }
  }
  return obj;
}

// ---- CLI -----------------------------------------------------------------------
// `link` writes/updates github.json for a change — used by the propose-gh workflow to
// bind a freshly-scaffolded change to its GitHub issue. Idempotent: re-running merges.
//
//   node github-link.js link <change> --issue-number <n> [--issue-url U] [--issue-title T]
//                              [--status todo|in-progress|in-review|done] [--branch B] [--at YYYY-MM-DD]
//   node github-link.js read <change> [--json]
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

function main() {
  const a = parseArgs(process.argv.slice(2));
  const verb = a._[0];
  const change = a._[1];
  if (verb === 'read') {
    if (!change) throw new Error('usage: github-link.js read <change>');
    process.stdout.write(JSON.stringify(read(change) || null, null, a.json ? 2 : 0) + '\n');
    return;
  }
  if (verb === 'link') {
    if (!change) throw new Error('usage: github-link.js link <change> --issue-number <n> [...]');
    const obj = read(change) || migrate({ change });
    obj.change = change;
    const issuePatch = {};
    if (a['issue-number'] && a['issue-number'] !== true) issuePatch.number = Number(a['issue-number']) || 0;
    if (a['issue-url'] && a['issue-url'] !== true) issuePatch.url = a['issue-url'];
    if (a['issue-title'] && a['issue-title'] !== true) issuePatch.title = a['issue-title'];
    if (Object.keys(issuePatch).length) setRefs(obj, { issue: issuePatch });
    if (a.branch && a.branch !== true) obj.branch = a.branch;
    if (a.status && a.status !== true) obj.status = a.status;
    appendHistory(obj, { at: a.at && a.at !== true ? a.at : '', event: 'propose-gh', status: obj.status });
    const p = write(change, obj);
    process.stdout.write(JSON.stringify({ ok: true, path: p, change, issue: obj.issue, status: obj.status }, null, a.json ? 2 : 0) + '\n');
    return;
  }
  process.stderr.write('usage: github-link.js <link|read> <change> …\n');
  process.exit(2);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write('github-link: ' + (e && e.message ? e.message : String(e)) + '\n'); process.exit(1); }
}

module.exports = { V, linkPath, issueRef, prRef, migrate, read, write, appendHistory, setRefs };
