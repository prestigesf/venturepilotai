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
const [engineRoot, factsPath, fromArg, toArg] = process.argv.slice(2);
if (!engineRoot || !factsPath) {
  process.stderr.write('usage: sweep-phases.mjs <engine-root> <lawpack-facts.json> [from] [to]\n');
  process.exit(2);
}
const from = Number(fromArg || 1);
const to = Number(toArg || 33);

const dir = await mkdtemp(join(tmpdir(), 'dsf-sweep-'));
const rows = [];
for (let p = from; p <= to; p += 1) {
  const out = join(dir, `phase${p}.json`);
  try {
    await run(process.execPath, [join(HERE, 'deadlinesf-phase.mjs'), engineRoot, String(p), out, factsPath]);
  } catch { continue; }
  const state = JSON.parse(await readFile(out, 'utf8'));
  rows.push({ phase: p, state, score: score(state), counters: counters(state) });
}

process.stdout.write('\nphase   score   delta   rules  wired  packs  cases  files\n');
process.stdout.write('-'.repeat(60) + '\n');
let prev = null;
for (const r of rows) {
  const d = prev === null ? '—' : `${r.score.total - prev > 0 ? '+' : ''}${Math.round((r.score.total - prev) * 10) / 10}`;
  const m = r.state.measurement;
  const supported = (m.rules_evaluated ?? 0) - (m.rules_unsupported ?? 0);
  process.stdout.write(
    `${String(r.phase).padStart(5)}${String(r.score.total).padStart(8)}${String(d).padStart(8)}`
    + `${String(m.rules_total ?? 0).padStart(8)}${String(supported).padStart(7)}`
    + `${String(r.counters.authority_mappings).padStart(7)}`
    + `${String(m.regression_test_cases ?? 0).padStart(7)}`
    + `${String(r.state.source_evidence.baseline_files).padStart(7)}\n`,
  );
  prev = r.score.total;
}

// Resolution check. The question is not whether terms sit at 1.0 in the final
// phase — a finished engine should — but whether any term MOVED across the
// sweep. A term that never varies is contributing no information, and a flat
// curve built from such terms says nothing about the engine.
const termKey = (c, t) => `${c.id}::${t.label}`;
const seen = new Map();
for (const r of rows) {
  for (const c of r.score.components) {
    for (const t of c.terms) {
      const k = termKey(c, t);
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(t.measured ? t.value : null);
    }
  }
}
const varying = [...seen.entries()].filter(([, vals]) => vals.size > 1);
const inert = [...seen.entries()].filter(([, vals]) => vals.size <= 1);
process.stdout.write(
  `\nRESOLUTION: ${varying.length} of ${seen.size} term(s) moved across phases `
  + `${from}-${to}; ${inert.length} never varied.\n`,
);
for (const [k, vals] of inert) {
  const only = [...vals][0];
  process.stdout.write(`  inert: ${k} — ${only === null ? 'never measured' : `always ${only}`}\n`);
}
if (varying.length === 0) {
  process.stdout.write(
    '\nNo term moved. This curve cannot show growth; the flat line is a property\n'
    + 'of the adapter, not a finding about the engine.\n',
  );
}
