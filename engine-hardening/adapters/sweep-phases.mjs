#!/usr/bin/env node
/**
 * sweep-phases.mjs — score every DeadlineSF phase and print the strength curve.
 *
 *   node engine-hardening/adapters/sweep-phases.mjs <engine-root> [from] [to]
 *
 * READ-ONLY against the engine. Builds a state per phase via deadlinesf-phase.mjs
 * and scores each one, so the curve is computed from the same verified artifacts
 * every other number here comes from.
 *
 * Read the RESOLUTION line at the end before trusting a flat curve: when every
 * measured term sits at 1.0 and the rest are unmeasured, the score is flat
 * because the adapter cannot see growth, not because none happened.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { score, counters } from '../lib/index.js';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const [engineRoot, fromArg, toArg] = process.argv.slice(2);
if (!engineRoot) {
  process.stderr.write('usage: sweep-phases.mjs <engine-root> [from] [to]\n');
  process.exit(2);
}
const from = Number(fromArg || 1);
const to = Number(toArg || 33);

const dir = await mkdtemp(join(tmpdir(), 'dsf-sweep-'));
const rows = [];
for (let p = from; p <= to; p += 1) {
  const out = join(dir, `phase${p}.json`);
  try {
    await run(process.execPath, [join(HERE, 'deadlinesf-phase.mjs'), engineRoot, String(p), out]);
  } catch { continue; }
  const state = JSON.parse(await readFile(out, 'utf8'));
  rows.push({ phase: p, state, score: score(state), counters: counters(state) });
}

process.stdout.write('\nphase   score   delta  detectors  cases  authority  files\n');
process.stdout.write('-'.repeat(62) + '\n');
let prev = null;
for (const r of rows) {
  const d = prev === null ? '—' : `${r.score.total - prev > 0 ? '+' : ''}${Math.round((r.score.total - prev) * 10) / 10}`;
  process.stdout.write(
    `${String(r.phase).padStart(5)}${String(r.score.total).padStart(8)}${String(d).padStart(8)}`
    + `${String(r.counters.active_detectors).padStart(11)}`
    + `${String(r.state.measurement.regression_test_cases).padStart(7)}`
    + `${String(r.counters.authority_mappings).padStart(11)}`
    + `${String(r.state.source_evidence.baseline_files).padStart(7)}\n`,
  );
  prev = r.score.total;
}

// Resolution check: a term whose numerator and denominator both derive from the
// same count is pinned at 1.0 and can never register growth. Say so plainly
// rather than letting a flat line read as "the engine did not improve".
const last = rows[rows.length - 1];
if (last) {
  const measured = last.score.components.flatMap((c) => c.terms.filter((t) => t.measured));
  const pinned = measured.filter((t) => t.value === 1).length;
  const unmeasured = last.score.components.flatMap((c) => c.terms.filter((t) => !t.measured)).length;
  process.stdout.write(
    `\nRESOLUTION: ${measured.length} measured term(s), ${pinned} pinned at 1.0, `
    + `${unmeasured} unmeasured.\n`,
  );
  if (pinned === measured.length) {
    process.stdout.write(
      'Every measured term is saturated, so this curve cannot show growth. The flat\n'
      + 'line is a property of the adapter, not a finding about the engine.\n',
    );
  }
}
