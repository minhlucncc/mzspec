#!/usr/bin/env node
'use strict';
/*
 * task-sources CLI — the entrypoint the /opsx:task workflow calls via Bash
 * (the same way ship-code calls gate-resolver.js). Prints JSON to stdout.
 *
 *   node .claude/workflows/lib/task-sources/cli.js list   [--source N] [--status S]
 *   node .claude/workflows/lib/task-sources/cli.js next   [--source N]
 *   node .claude/workflows/lib/task-sources/cli.js get        <id> [--source N]
 *   node .claude/workflows/lib/task-sources/cli.js create     --title T [--body B | stdin] [--labels a,b] [--source N]
 *   node .claude/workflows/lib/task-sources/cli.js set-status   <id> <status> [--source N]
 *   node .claude/workflows/lib/task-sources/cli.js set-assignee <id> <login>  [--source N]   (login "" clears)
 *   node .claude/workflows/lib/task-sources/cli.js comment      <id> [--text T | stdin] [--source N]
 *
 * Config is found by walking up to the nearest mzspec.config.json.
 */

const { loadConfig } = require('../load-config.js');
const { resolveSource } = require('./index.js');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else out._.push(a);
  }
  return out;
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd) {
    process.stderr.write('usage: cli.js <list|next|get|create|set-status|set-assignee|comment> [...]\n');
    process.exit(2);
  }
  // A legacy mzspec.config.json is honored if present; otherwise the task source is
  // inferred (zero-config) by resolveSource → pickSourceEntry (e.g. gh-issues from
  // the git remote). Don't throw just because there's no config file.
  let config;
  try { config = loadConfig(); } catch { config = {}; }
  const { entry, source } = resolveSource(config, args.source);

  let result;
  switch (cmd) {
    case 'list':
      result = { source: entry.name, type: entry.type, tasks: await source.list({ status: args.status }) };
      break;
    case 'next': {
      // The next task to pull is the first 'todo'. In-progress/in-review/done are
      // not pullable, so return null when there's no todo (clean "backlog empty").
      const todo = await source.list({ status: 'todo' });
      result = { source: entry.name, type: entry.type, task: (todo[0] || null) };
      break;
    }
    case 'get':
      result = await source.get(args._[1]);
      break;
    case 'create': {
      const body = args.body === true || args.body == null ? readStdin() : args.body;
      const labels = args.labels && args.labels !== true ? String(args.labels).split(',').map((s) => s.trim()).filter(Boolean) : [];
      result = await source.create({ title: args.title, body, labels });
      break;
    }
    case 'set-status':
      result = await source.setStatus(args._[1], args._[2]);
      break;
    case 'set-assignee':
      if (typeof source.setAssignee !== 'function') throw new Error(`source "${entry.type}" does not support set-assignee`);
      result = await source.setAssignee(args._[1], args._[2] || '');
      break;
    case 'comment': {
      const text = args.text === true || args.text == null ? readStdin() : args.text;
      result = await source.comment(args._[1], text);
      break;
    }
    default:
      process.stderr.write(`unknown command: ${cmd}\n`);
      process.exit(2);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((e) => {
  process.stderr.write('task-sources: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
