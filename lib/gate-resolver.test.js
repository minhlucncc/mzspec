'use strict';
// Run: node --test lib/gate-resolver.test.js
// Drives the config-driven resolver off the meknow example config (the same
// inventory the platform repo hardcodes today), proving behavior parity.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolve, classify } = require('./gate-resolver.js');

const CONFIG = require(path.join(__dirname, '..', 'examples', 'meknow', 'mzspec.config.json'));

test('py-only change → py gates + free bench ladder + validate', () => {
  const p = resolve(['packages/rag-core/rag_core/tools/retrieve_kb.py'], CONFIG);
  assert.deepStrictEqual(p.toolchains.sort(), ['bench', 'py']);
  const py = p.units.find((u) => u.toolchain === 'py');
  assert.strictEqual(py.unitDir, 'packages/rag-core');
  assert.ok(py.gates.some((g) => g.cmd.includes('pytest')));
  assert.ok(p.always.some((g) => g.name === 'openspec-validate'));
  assert.strictEqual(p.flags.touchesSubmoduleOnly, false);
});

test('go-only change → go gates, no bench ladder', () => {
  const p = resolve(['apps/worker-mello/internal/mcp/server.go'], CONFIG);
  assert.deepStrictEqual(p.toolchains, ['go']);
  const go = p.units.find((u) => u.toolchain === 'go');
  assert.strictEqual(go.unitDir, 'apps/worker-mello');
  assert.ok(go.gates.some((g) => g.cmd.includes('go test -race')));
  assert.ok(!p.toolchains.includes('bench'));
});

test('ts-only change → portal gates', () => {
  const p = resolve(['apps/portal/src/routes/index.tsx'], CONFIG);
  assert.deepStrictEqual(p.toolchains, ['ts']);
  const ts = p.units.find((u) => u.toolchain === 'ts');
  assert.ok(ts.gates.some((g) => g.cmd.includes('pnpm typecheck')));
});

test('multi-language change → py + go + ts + bench, deduped', () => {
  const p = resolve(
    ['packages/rag-core/a.py', 'packages/agent-core/b.py', 'apps/worker-mezon-go/c.go', 'apps/portal/d.ts'],
    CONFIG
  );
  assert.deepStrictEqual(p.toolchains.sort(), ['bench', 'go', 'py', 'ts']);
  const pyDirs = p.units.filter((u) => u.toolchain === 'py').map((u) => u.unitDir).sort();
  assert.deepStrictEqual(pyDirs, ['packages/agent-core', 'packages/rag-core']);
});

test('migration touch → migration always-gate + flag', () => {
  const p = resolve(['apps/backend/migrations/versions/0055_x.py'], CONFIG);
  assert.strictEqual(p.flags.touchesMigrations, true);
  assert.ok(p.always.some((g) => g.name === 'migration'));
});

test('bench-only change → free ladder, touchesBench flag', () => {
  const p = resolve(['benchmarks/attentionbench/run.py'], CONFIG);
  assert.strictEqual(p.flags.touchesBench, true);
  assert.ok(p.units.some((u) => u.toolchain === 'bench'));
});

test('docs/spec-only change → meta-only, submodule-only stays true, validate only', () => {
  const p = resolve(['openspec/specs/data-model/spec.md', 'docs/design/0001-data-model.md', 'README.md'], CONFIG);
  assert.deepStrictEqual(p.toolchains, []);
  assert.strictEqual(p.flags.touchesSubmoduleOnly, true);
  assert.ok(p.always.some((g) => g.name === 'openspec-validate'));
});

test('classify: go module wins over a py-looking sibling name', () => {
  assert.strictEqual(classify('packages/event-core/topic.go', CONFIG).toolchain, 'go');
});

test('customGates: a project gate fires when its `when` matches', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.customGates = [{ name: 'acl', cmd: 'bash benchmarks/gates/retrieve-kb-acl-test.sh', when: { toolchains: ['py'] } }];
  const p = resolve(['packages/rag-core/a.py'], cfg);
  assert.ok(p.custom.some((g) => g.name === 'acl'));
  // ...and does not fire for an unrelated (go-only) change
  const q = resolve(['apps/worker-mello/x.go'], cfg);
  assert.ok(!q.custom.some((g) => g.name === 'acl'));
});
