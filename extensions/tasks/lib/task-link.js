#!/usr/bin/env node
'use strict';
/*
 * task-link — the single source of truth for openspec/changes/<change>/.task-link.json.
 *
 * v1 (written by /opsx:task-pull, task.js) carried { source, type, taskId, taskTitle,
 * status, history:[{at,status}] }. v2 adds the cross-reference fields the lifecycle
 * dispatcher wires together: the assignee, the branch, the spec/code PRs, the CHANGELOG
 * bullet, and the archive path. `migrate()` upgrades a v1 file in place (defaults the
 * new fields), so old files keep loading and old readers keep working.
 */

const fs = require('fs');
const path = require('path');
const { findRepoRoot } = require('./discover.js');

const V = 2;

function linkPath(change, startDir) {
  const root = findRepoRoot(startDir || process.cwd());
  return path.join(root, 'openspec', 'changes', change, '.task-link.json');
}

function prRef(x) {
  return { url: (x && x.url) || '', number: (x && x.number) || 0, mergedSha: (x && x.mergedSha) || '' };
}

// Upgrade any v1/partial object to the full v2 shape. Never throws; returns null for
// non-objects so a garbage file reads as "no link".
function migrate(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = { ...obj };
  o.v = V;
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

// Shallow-merge ref fields onto the link; specPr/codePr merge field-by-field so a
// partial { mergedSha } patch keeps the existing url/number.
function setRefs(obj, patch) {
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v == null) continue;
    if ((k === 'specPr' || k === 'codePr') && typeof v === 'object') {
      obj[k] = { ...prRef(obj[k]), ...v };
    } else {
      obj[k] = v;
    }
  }
  return obj;
}

module.exports = { V, linkPath, prRef, migrate, read, write, appendHistory, setRefs };
