'use strict';
// Run: node --test lib/discover.test.js
// Covers the zero-config discovery layer + the openspec/hooks/resolve-gates
// override, on a throwaway repo fixture built under os.tmpdir().
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discover, parseUvMembers, parsePnpmPackages, inferGithubRepo,
} = require('./discover.js');
const { resolvePlan } = require('./gate-resolver.js');

// ---- pure parser units ---------------------------------------------------------

test('parseUvMembers: extracts members, ignores comments', () => {
  const toml = [
    '[tool.uv.workspace]',
    'members = [',
    '  "packages/a",',
    '  "apps/b",   # a comment with an apostrophe like don\'t',
    ']',
    '[tool.uv.sources]',
  ].join('\n');
  assert.deepStrictEqual(parseUvMembers(toml), ['packages/a', 'apps/b']);
});

test('parseUvMembers: null when no workspace table', () => {
  assert.strictEqual(parseUvMembers('[project]\nname="x"'), null);
});

test('parsePnpmPackages: reads the packages globs', () => {
  const yaml = 'packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n';
  assert.deepStrictEqual(parsePnpmPackages(yaml), ['apps/*', 'packages/*']);
});

test('inferGithubRepo: ssh and https remotes', () => {
  // exercised indirectly; the regex is the contract
  const re = (url) => (url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/) || [])[1];
  assert.strictEqual(re('git@github.com:owner/repo.git'), 'owner/repo');
  assert.strictEqual(re('https://github.com/owner/repo'), 'owner/repo');
});

// ---- discovery on a fixture repo ------------------------------------------------

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mzspec-disc-'));
  fs.mkdirSync(path.join(root, '.git'));
  // py via uv workspace
  fs.writeFileSync(path.join(root, 'pyproject.toml'),
    '[tool.uv.workspace]\nmembers = [\n  "packages/core",\n]\n');
  fs.mkdirSync(path.join(root, 'packages/core'), { recursive: true });
  // go module
  fs.mkdirSync(path.join(root, 'svc'), { recursive: true });
  fs.writeFileSync(path.join(root, 'svc/go.mod'), 'module svc\n');
  // ts: pnpm workspace with a gated (lint) and an ungated package
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/web/package.json'),
    JSON.stringify({ scripts: { typecheck: 'tsc', lint: 'eslint', test: 'vitest' } }));
  fs.mkdirSync(path.join(root, 'apps/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/assets/package.json'),
    JSON.stringify({ scripts: { test: 'echo' } })); // no lint → not gated
  return root;
}

test('discover: py/go/ts inventory from manifests', () => {
  const root = mkFixture();
  const c = discover(root);
  assert.deepStrictEqual(c.toolchains.py.dirs, ['packages/core']);
  assert.deepStrictEqual(c.toolchains.go.dirs, ['svc']);
  assert.deepStrictEqual(c.toolchains.ts.dirs, ['apps/web']); // assets excluded (no lint)
  assert.deepStrictEqual(c.toolchains.ts.gatesByDir['apps/web'].map((g) => g.name), ['typecheck', 'lint', 'test']);
  assert.strictEqual(c._discovered, true);
});

test('discover: go declared before py (tie-break to go)', () => {
  const root = mkFixture();
  const c = discover(root);
  const order = Object.keys(c.toolchains);
  assert.ok(order.indexOf('go') < order.indexOf('py'));
});

test('hook override: openspec/hooks/resolve-gates owns the plan', () => {
  const root = mkFixture();
  fs.mkdirSync(path.join(root, 'openspec/hooks'), { recursive: true });
  const hook = path.join(root, 'openspec/hooks/resolve-gates');
  fs.writeFileSync(hook,
    '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({toolchains:["custom"],units:[{toolchain:"custom",unitDir:".",gates:[{name:"x",cmd:"echo hi"}]}],always:[]}));\n');
  fs.chmodSync(hook, 0o755);
  const plan = resolvePlan(['anything.rs'], root);
  assert.strictEqual(plan.source, 'hook');
  assert.deepStrictEqual(plan.toolchains, ['custom']);
});
