#!/usr/bin/env node
/**
 * engine-delta — the Engine Hardening Layer CLI.
 *
 *   engine-delta score    [--state P] [--json]
 *   engine-delta run      --run P [--before P] [--after P] [--ledger P] [--dry-run] [--json]
 *   engine-delta verify   [--ledger P] [--json]
 *   engine-delta history  [--ledger P] [--json]
 *   engine-delta show     <run_id|latest> [--ledger P] [--json]
 *   engine-delta export   [--state P] [--ledger P] [--out P]
 *
 * The hard rule lives in `run`: a pack run is not recorded until it produces
 * either a measurable hardening delta or a signed VALIDATED_NO_CHANGE receipt.
 * Anything else exits non-zero and writes nothing.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReceipt, checkCompleteness, appendReceipt, verifyLedger, history,
  headHash, readJson, writeJson, EMPTY_LEDGER, renderReceipt, renderSummary,
  score, productSurface,
} from '../lib/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_STATE = join(ROOT, 'state', 'engine-state.json');
const DEFAULT_LEDGER = join(ROOT, 'state', 'ledger.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i += 1; }
    } else args._.push(a);
  }
  return args;
}

function fail(message) {
  process.stderr.write(`engine-delta: ${message}\n`);
  process.exit(2);
}

function bar(value, max, width = 24) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return `${'█'.repeat(Math.max(0, filled))}${'░'.repeat(Math.max(0, width - filled))}`;
}

/* ------------------------------------------------------------------ score */
async function cmdScore(args) {
  const state = await readJson(resolve(args.state || DEFAULT_STATE));
  const result = score(state);
  if (args.json) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0; }

  process.stdout.write(`\nENGINE STRENGTH SCORE — ${state.engine_version} (${state.data_class || 'LIVE'})\n\n`);
  for (const c of result.components) {
    const flag = c.measured ? '' : '  ← unmeasured';
    process.stdout.write(
      `  ${c.label.padEnd(22)}${String(c.points).padStart(5)} / ${String(c.max).padEnd(4)} ${bar(c.points, c.max)}${flag}\n`,
    );
    for (const t of c.terms) {
      const mark = t.measured ? ' ' : '!';
      process.stdout.write(`     ${mark} ${t.label.padEnd(48)} ${String(t.value).padStart(6)}  → ${t.contribution} pt\n`);
      process.stdout.write(`        ${t.formula}\n`);
    }
    for (const [k, r] of Object.entries(c.raw)) {
      process.stdout.write(`        · ${k.padEnd(38)} ${String(r.value).padStart(6)}  [${r.basis}]\n`);
    }
    for (const n of c.notes) process.stdout.write(`        ⚠ ${n}\n`);
    process.stdout.write('\n');
  }
  process.stdout.write(`  ${'TOTAL'.padEnd(22)}${String(result.total).padStart(5)} / 100\n`);
  if (result.unmeasured.length > 0) {
    process.stdout.write(`\n  Unmeasured components score 0: ${result.unmeasured.join(', ')}\n`);
  }
  process.stdout.write('\n');
  return 0;
}

/* -------------------------------------------------------------------- run */
async function cmdRun(args) {
  if (!args.run) fail('run requires --run <pack-run.json>');
  const runPath = resolve(args.run);
  const beforePath = resolve(args.before || DEFAULT_STATE);
  const afterPath = resolve(args.after || args.state || DEFAULT_STATE);
  const ledgerPath = resolve(args.ledger || DEFAULT_LEDGER);

  const run = await readJson(runPath);
  const beforeState = await readJson(beforePath);
  const afterState = await readJson(afterPath);
  const ledger = await readJson(ledgerPath, EMPTY_LEDGER);

  if (beforePath === afterPath) {
    process.stderr.write(
      'engine-delta: --before and --after resolve to the same file; the delta will be empty.\n'
      + '              Point --after at the post-run state to record hardening.\n',
    );
  }

  const receipt = buildReceipt({
    run,
    beforeState,
    afterState,
    previousHash: headHash(ledger),
  });
  const gate = checkCompleteness(receipt);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ receipt, completeness: gate }, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${renderReceipt(receipt)}\n\n`);
    process.stdout.write(`COMPLETENESS: ${gate.status}\n`);
    for (const f of gate.failures) process.stdout.write(`  ✗ ${f}\n`);
    for (const w of gate.warnings) process.stdout.write(`  ⚠ ${w}\n`);
    process.stdout.write('\n');
  }

  if (!gate.complete) {
    process.stderr.write(
      'engine-delta: run INCOMPLETE — nothing written.\n'
      + '              A pack run is not complete until it produces either a measurable\n'
      + '              hardening delta or a signed VALIDATED_NO_CHANGE receipt.\n',
    );
    return 1;
  }
  if (args['dry-run']) {
    process.stdout.write('Dry run — ledger and state left untouched.\n');
    return 0;
  }

  await writeJson(ledgerPath, appendReceipt(ledger, receipt));
  process.stdout.write(`Receipt ${receipt.receipt_hash.slice(0, 12)}… appended to ${ledgerPath}\n`);

  // Promotion advances the LIVE engine state, so it only happens when this run was
  // actually recorded into the LIVE ledger. A run against a scratch ledger — a dry
  // rehearsal, a replay, a test — must never mutate the live state as a side effect.
  const promoting = ledgerPath === DEFAULT_LEDGER && afterPath !== DEFAULT_STATE;
  if (args['no-promote']) {
    process.stdout.write(`Live state left at ${DEFAULT_STATE} (--no-promote).\n`);
  } else if (promoting) {
    await writeJson(DEFAULT_STATE, {
      ...afterState,
      state_version: (afterState.state_version ?? 0) + 1,
      last_pack_id: run.pack_id,
      updated_at: run.timestamp,
      commit: run.ending_commit ?? afterState.commit ?? null,
    });
    process.stdout.write(`Live state promoted to ${DEFAULT_STATE}\n`);
  } else if (ledgerPath !== DEFAULT_LEDGER) {
    process.stdout.write(`Scratch ledger — live state at ${DEFAULT_STATE} untouched.\n`);
  }
  return 0;
}

/* ----------------------------------------------------------------- verify */
async function cmdVerify(args) {
  const ledger = await readJson(resolve(args.ledger || DEFAULT_LEDGER), EMPTY_LEDGER);
  const result = verifyLedger(ledger);
  if (args.json) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return result.ok ? 0 : 1; }
  process.stdout.write(`\nLedger: ${result.receipts} receipt(s), head ${result.head.slice(0, 16)}…\n`);
  if (result.ok) { process.stdout.write('Chain verified: every link, digest and completeness gate holds.\n\n'); return 0; }
  process.stdout.write('Chain FAILED verification:\n');
  for (const p of result.problems) process.stdout.write(`  ✗ ${p}\n`);
  process.stdout.write('\n');
  return 1;
}

/* ---------------------------------------------------------------- history */
async function cmdHistory(args) {
  const ledger = await readJson(resolve(args.ledger || DEFAULT_LEDGER), EMPTY_LEDGER);
  const rows = history(ledger);
  if (args.json) { process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`); return 0; }
  if (rows.length === 0) { process.stdout.write('\nNo receipts yet. Run a pack.\n\n'); return 0; }
  process.stdout.write('\nPACK HISTORY\n\n');
  for (const r of rows) {
    process.stdout.write(`  ${renderSummary({ ...r, strength: { before: r.score_before, after: r.score_after, change: r.score_change }, engine_delta: r.delta })}\n`);
  }
  process.stdout.write('\n');
  return 0;
}

/* ------------------------------------------------------------------- show */
async function cmdShow(args) {
  const ledger = await readJson(resolve(args.ledger || DEFAULT_LEDGER), EMPTY_LEDGER);
  const target = args._[1];
  const receipts = ledger.receipts || [];
  if (receipts.length === 0) fail('ledger is empty');
  const receipt = !target || target === 'latest'
    ? receipts[receipts.length - 1]
    : receipts.find((r) => r.run_id === target || r.pack_id === target);
  if (!receipt) fail(`no receipt for "${target}"`);
  if (args.json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`\n${renderReceipt(receipt)}\n\n`);
  return 0;
}

/* ----------------------------------------------------------------- export */
async function cmdExport(args) {
  const statePath = resolve(args.state || DEFAULT_STATE);
  const ledgerPath = resolve(args.ledger || DEFAULT_LEDGER);
  const outPath = resolve(args.out || join(ROOT, 'state', 'widget-data.json'));
  const state = await readJson(statePath);
  const ledger = await readJson(ledgerPath, EMPTY_LEDGER);
  const current = score(state);
  const rows = history(ledger);

  const unlocks = [];
  for (const r of ledger.receipts || []) {
    for (const p of r.product_propagation || []) {
      for (const cap of p.unlocked || []) {
        unlocks.push({ pack_id: r.pack_id, capability: cap, product_id: p.product_id, product: p.product });
      }
    }
  }

  const bundle = {
    generated_at: new Date().toISOString(),
    data_class: state.data_class || 'LIVE',
    engine_version: state.engine_version,
    score: current,
    counters: rows.length > 0 ? rows[rows.length - 1] : null,
    history: rows,
    products: productSurface(state),
    capability_unlocks: unlocks,
    ledger_head: headHash(ledger),
    verification: verifyLedger(ledger),
  };
  await writeJson(outPath, bundle);
  process.stdout.write(`Widget bundle written to ${outPath}\n`);
  return 0;
}

const COMMANDS = { score: cmdScore, run: cmdRun, verify: cmdVerify, history: cmdHistory, show: cmdShow, export: cmdExport };

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (!command || args.help) {
  process.stdout.write(`engine-delta — Engine Hardening Layer

  score    [--state P] [--json]                 Strength score with every raw number behind it
  run      --run P [--before P] [--after P]     Build, gate and record an ENGINE DELTA RECEIPT
           [--ledger P] [--dry-run] [--json]     Promotes the after-state to the live state only
           [--no-promote]                        when recording into the live ledger.
  verify   [--ledger P] [--json]                Verify the receipt chain end to end
  history  [--ledger P] [--json]                One line per pack run
  show     <run_id|latest> [--json]             Render a full receipt
  export   [--out P]                            Build the widget data bundle

Set ENGINE_HARDENING_SIGNING_KEY to produce signed receipts. A
VALIDATED_NO_CHANGE result is only accepted when the receipt is signed.
`);
  process.exit(command ? 0 : 1);
}
if (!COMMANDS[command]) fail(`unknown command "${command}"`);
process.exit(await COMMANDS[command](args));
