/**
 * CLI tests — the file I/O path the library tests do not reach.
 *
 * The promotion guard is here because it was a real bug: a run recorded against a
 * scratch ledger used to overwrite the LIVE engine state as a side effect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'engine-delta.mjs');
const LIVE_STATE = join(ROOT, 'state', 'engine-state.json');
const LIVE_LEDGER = join(ROOT, 'state', 'ledger.json');

async function cli(args, env = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'engine-hardening-'));
  await cp(LIVE_STATE, join(dir, 'before.json'));
  await cp(LIVE_LEDGER, join(dir, 'ledger.json'));

  const before = JSON.parse(await readFile(join(dir, 'before.json'), 'utf8'));
  const after = structuredClone(before);
  after.controls.detectors.push({
    id: 'det.scratch', name: 'Scratch detector', kind: 'deterministic',
    failure_modes: ['fm.scratch'], products: ['venturepilotai'],
  });
  after.controls.regression_tests.push({
    id: 't.scratch.01', status: 'PASS', covers_detector: 'det.scratch', covers_failure_mode: 'fm.scratch',
  });
  Object.assign(after.measurement, {
    rules_total: 5, rules_evaluated: 5, failure_modes_known: 1,
    deterministic_checks_total: 3, deterministic_checks_executed: 3,
  });
  await writeFile(join(dir, 'after.json'), JSON.stringify(after, null, 2));

  const record = {
    pack_id: 'PACK_SCRATCH', pack_version: '1.0.0', run_id: 'run-scratch-1',
    timestamp: '2026-08-22T00:00:00Z', starting_commit: 'aaa111', ending_commit: 'bbb222',
    rules_evaluated: ['R1', 'R2', 'R3', 'R4', 'R5'], rules_unsupported: [],
    authority_sources_used: ['S1'], deterministic_checks_executed: ['c1', 'c2', 'c3'],
    discoveries: { new_failure_modes: [{ id: 'fm.scratch', description: 'found in scratch' }] },
  };
  await writeFile(join(dir, 'run.json'), JSON.stringify(record, null, 2));
  return dir;
}

test('a run against a scratch ledger never mutates the live engine state', async () => {
  const dir = await scratch();
  const liveBefore = await readFile(LIVE_STATE, 'utf8');
  const result = await cli([
    'run', '--run', join(dir, 'run.json'),
    '--before', join(dir, 'before.json'), '--after', join(dir, 'after.json'),
    '--ledger', join(dir, 'ledger.json'),
  ], { ENGINE_HARDENING_SIGNING_KEY: 'cli-test-key' });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /live state .* untouched/i);
  assert.equal(await readFile(LIVE_STATE, 'utf8'), liveBefore, 'live state byte-identical');

  const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
  assert.equal(ledger.receipts.length, 1);
  assert.equal(ledger.receipts[0].result, 'IMPROVED');
});

test('an incomplete run exits non-zero and writes nothing', async () => {
  const dir = await scratch();
  // Same state either side: no delta, and a discovery nothing addressed.
  const result = await cli([
    'run', '--run', join(dir, 'run.json'),
    '--before', join(dir, 'after.json'), '--after', join(dir, 'after.json'),
    '--ledger', join(dir, 'ledger.json'),
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /INCOMPLETE — nothing written/);
  const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
  assert.equal(ledger.receipts.length, 0, 'nothing appended');
});

test('an unsigned no-change run is rejected', async () => {
  const dir = await scratch();
  const record = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  record.discoveries = {}; // nothing found — the honest no-change path
  await writeFile(join(dir, 'run.json'), JSON.stringify(record, null, 2));

  const unsigned = await cli([
    'run', '--run', join(dir, 'run.json'),
    '--before', join(dir, 'after.json'), '--after', join(dir, 'after.json'),
    '--ledger', join(dir, 'ledger.json'),
  ], { ENGINE_HARDENING_SIGNING_KEY: '' });
  assert.equal(unsigned.code, 1);
  assert.match(unsigned.stdout, /VALIDATED_NO_CHANGE must be signed/);

  const signedRun = await cli([
    'run', '--run', join(dir, 'run.json'),
    '--before', join(dir, 'after.json'), '--after', join(dir, 'after.json'),
    '--ledger', join(dir, 'ledger.json'),
  ], { ENGINE_HARDENING_SIGNING_KEY: 'cli-test-key' });
  assert.equal(signedRun.code, 0, signedRun.stderr);
  assert.match(signedRun.stdout, /VALIDATED_NO_CHANGE/);
});

test('--dry-run records nothing', async () => {
  const dir = await scratch();
  const result = await cli([
    'run', '--run', join(dir, 'run.json'),
    '--before', join(dir, 'before.json'), '--after', join(dir, 'after.json'),
    '--ledger', join(dir, 'ledger.json'), '--dry-run',
  ], { ENGINE_HARDENING_SIGNING_KEY: 'cli-test-key' });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Dry run/);
  const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
  assert.equal(ledger.receipts.length, 0);
});

test('verify exits non-zero on a rewritten chain', async () => {
  const dir = await scratch();
  const example = join(ROOT, 'examples', 'example-ledger.json');
  const ledger = JSON.parse(await readFile(example, 'utf8'));
  ledger.receipts[2].strength.after = 99;
  const tamperedPath = join(dir, 'tampered.json');
  await writeFile(tamperedPath, JSON.stringify(ledger, null, 2));

  const result = await cli(['verify', '--ledger', tamperedPath]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAILED verification/);
});

test('score reports the live engine as 0 until something is measured', async () => {
  const result = await cli(['score']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /TOTAL\s+0 \/ 100/);
  assert.match(result.stdout, /Unmeasured components score 0/);
});
