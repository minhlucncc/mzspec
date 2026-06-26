'use strict';
/*
 * task-sources — resolve the configured task source and dispatch a verb.
 *
 * Mirrors gate-resolver.js: `taskSources` come from the project's
 * mzspec.config.json when present, else are inferred (zero-config) — a gh-issues
 * source from `git remote get-url origin`. Instantiates the selected adapter and
 * exposes a uniform list/get/setStatus/comment surface. The /opsx:task workflow
 * drives this via the CLI (cli.js) the same way ship-code drives gate-resolver.js.
 */

const { LocalFolderSource } = require('./local-folder.js');
const { GhIssuesSource } = require('./gh-issues.js');
const { MelloSource } = require('./mello.js');
const { discoverTaskSources } = require('../discover.js');

const ADAPTERS = {
  'local-folder': LocalFolderSource,
  'gh-issues': GhIssuesSource,
  'mello-cli': MelloSource,
};

// Pick the source entry: by name (`--source`), else the first enabled one.
// With no configured taskSources, infer one from the git remote (zero-config).
function pickSourceEntry(config, name) {
  let sources = (config && config.taskSources) || [];
  if (!sources.length) sources = discoverTaskSources();
  if (!sources.length) {
    throw new Error('no task source: add taskSources to mzspec.config.json, an openspec/hooks/task-source, or set a GitHub `origin` remote');
  }
  if (name) {
    const s = sources.find((x) => x.name === name || x.type === name);
    if (!s) throw new Error(`no task source named/typed "${name}" (have: ${sources.map((x) => x.name).join(', ')})`);
    return s;
  }
  const enabled = sources.find((x) => x.enabled !== false);
  if (!enabled) throw new Error('no enabled task source in taskSources');
  return enabled;
}

function makeSource(entry, config, opts = {}) {
  const Adapter = ADAPTERS[entry.type];
  if (!Adapter) throw new Error(`unknown task source type "${entry.type}" (have: ${Object.keys(ADAPTERS).join(', ')})`);
  return new Adapter(entry, { ...opts, statusMap: (config && config.taskStatusMap) || {} });
}

// Resolve directly from a loaded config object (used by tests + the CLI).
function resolveSource(config, name, opts = {}) {
  const entry = pickSourceEntry(config, name);
  return { entry, source: makeSource(entry, config, opts) };
}

module.exports = { ADAPTERS, pickSourceEntry, makeSource, resolveSource };
