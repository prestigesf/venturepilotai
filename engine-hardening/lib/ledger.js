/**
 * ledger.js — append-only receipt chain.
 *
 * Receipts are appended, never edited. Each links to the previous digest, so
 * verifyLedger() can tell you not just "is this receipt valid" but "has the
 * history been rewritten since".
 */

import { readFile, writeFile } from 'node:fs/promises';
import { canonicalize, sha256, GENESIS_HASH } from './canonical.js';
import { checkCompleteness } from './completeness.js';

export const EMPTY_LEDGER = {
  ledger_version: '1.0.0',
  engine: 'venturepilot-engine-hardening-layer',
  created_at: null,
  receipts: [],
};

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== null) return structuredClone(fallback);
    throw err;
  }
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function headHash(ledger) {
  const receipts = ledger.receipts || [];
  return receipts.length === 0 ? GENESIS_HASH : receipts[receipts.length - 1].receipt_hash;
}

export function appendReceipt(ledger, receipt) {
  const expectedPrev = headHash(ledger);
  if (receipt.previous_receipt_hash !== expectedPrev) {
    throw new Error(
      `chain break: receipt claims previous ${receipt.previous_receipt_hash?.slice(0, 12)}… `
      + `but ledger head is ${expectedPrev.slice(0, 12)}…`,
    );
  }
  if ((ledger.receipts || []).some((r) => r.run_id === receipt.run_id)) {
    throw new Error(`run_id ${receipt.run_id} is already in the ledger — receipts are append-only.`);
  }
  return {
    ...ledger,
    created_at: ledger.created_at || receipt.timestamp,
    receipts: [...(ledger.receipts || []), receipt],
  };
}

/** Verify every link, digest, signature and completeness gate in the chain. */
export function verifyLedger(ledger, opts = {}) {
  const receipts = ledger.receipts || [];
  const problems = [];
  let prev = GENESIS_HASH;

  receipts.forEach((receipt, i) => {
    const label = `receipt[${i}] ${receipt.pack_id || '?'} / ${receipt.run_id || '?'}`;
    if (receipt.previous_receipt_hash !== prev) {
      problems.push(`${label}: broken chain link (expected previous ${prev.slice(0, 12)}…)`);
    }
    const { receipt_hash: stored, ...rest } = receipt;
    const recomputed = sha256(canonicalize(rest));
    if (stored !== recomputed) problems.push(`${label}: receipt_hash does not match its contents`);
    const completeness = checkCompleteness(receipt, opts);
    for (const f of completeness.failures) problems.push(`${label}: ${f}`);
    prev = stored;
  });

  return {
    ok: problems.length === 0,
    receipts: receipts.length,
    head: headHash(ledger),
    problems,
  };
}

/** Flatten the chain into the rows the widget's PACK HISTORY view renders. */
export function history(ledger) {
  return (ledger.receipts || []).map((r) => ({
    pack_id: r.pack_id,
    pack_version: r.pack_version,
    run_id: r.run_id,
    timestamp: r.timestamp,
    result: r.result,
    score_before: r.strength?.before ?? null,
    score_after: r.strength?.after ?? null,
    score_change: r.strength?.change ?? 0,
    delta: r.engine_delta,
    discoveries: r.discoveries?.total ?? 0,
    hardening: r.hardening_added,
    propagation: r.product_propagation,
    reasons: r.result_reasons,
  }));
}
