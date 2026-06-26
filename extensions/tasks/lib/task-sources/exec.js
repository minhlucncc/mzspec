'use strict';
/*
 * exec — run an external CLI (gh / mello) and capture stdout.
 *
 * Kept tiny and dependency-free. Tests override the binary by putting a stub of
 * the same name earlier on PATH, so adapters never need a special test mode.
 */

const { execFileSync } = require('child_process');

function run(bin, args, opts = {}) {
  try {
    const out = execFileSync(bin, args, {
      encoding: 'utf8',
      input: opts.input,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out;
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr).trim() : '';
    throw new Error(`${bin} ${args.join(' ')} failed: ${stderr || (e && e.message) || 'unknown error'}`);
  }
}

function runJson(bin, args, opts = {}) {
  const out = run(bin, args, opts).trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch (e) {
    throw new Error(`${bin} ${args.join(' ')} did not return JSON: ${e.message}`);
  }
}

module.exports = { run, runJson };
