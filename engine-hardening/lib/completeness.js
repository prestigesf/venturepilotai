/**
 * completeness.js — the one hard engine rule.
 *
 *   A pack run is not complete until it produces either a measurable hardening
 *   delta or a signed VALIDATED_NO_CHANGE receipt.
 *
 * Everything else — INCONCLUSIVE, an unsigned no-change claim, a receipt whose
 * claimed delta is not present in the inventory — is an INCOMPLETE run. The CLI
 * exits non-zero on INCOMPLETE so a run cannot be quietly filed as progress.
 */

import { RESULTS } from './receipt.js';
import { verifyBody } from './canonical.js';

const REQUIRED_FIELDS = [
  'engine_version', 'pack_id', 'pack_version', 'run_id', 'timestamp',
  'starting_commit', 'ending_commit', 'previous_receipt_hash',
];

/**
 * @param {object} receipt
 * @param {object} [opts]
 * @param {string} [opts.signingKey]
 * @returns {{complete:boolean, status:string, failures:string[], warnings:string[]}}
 */
export function checkCompleteness(receipt, opts = {}) {
  const failures = [];
  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    if (receipt[field] === null || receipt[field] === undefined || receipt[field] === '') {
      failures.push(`missing required field: ${field}`);
    }
  }

  const { signature, ...body } = receipt;
  const bodyWithoutHash = { ...body };
  delete bodyWithoutHash.receipt_hash;
  const sig = verifyBody(bodyWithoutHash, signature, opts.signingKey);
  if (!sig.ok) failures.push(`signature: ${sig.reason}`);

  const delta = receipt.engine_delta || {};
  const measurable = delta.is_measurable === true;

  switch (receipt.result) {
    case RESULTS.IMPROVED: {
      if (!measurable) {
        failures.push('result is IMPROVED but the inventory diff shows no measurable delta — no fake improvement.');
      }
      const claimed = ['detectors', 'regression_tests', 'blocking_invariants', 'authority_mappings',
        'reusable_controls', 'refusal_conditions', 'provenance_controls', 'escalation_rules',
        'evidence_schemas', 'human_review_triggers']
        .reduce((s, k) => s + (delta[k] > 0 ? delta[k] : 0), 0);
      if (claimed === 0 && (delta.known_gaps ?? 0) >= 0) {
        failures.push('result is IMPROVED but nothing was added and no gap was closed.');
      }
      break;
    }
    case RESULTS.VALIDATED_NO_CHANGE: {
      if (!signature || signature.signed !== true) {
        failures.push(
          'VALIDATED_NO_CHANGE must be signed: set ENGINE_HARDENING_SIGNING_KEY so the no-change claim is attributable.',
        );
      }
      if (measurable) {
        failures.push('result is VALIDATED_NO_CHANGE but the inventory changed — reclassify the run.');
      }
      const executed = receipt.pack_coverage?.counts?.deterministic_checks_executed || 0;
      if (executed === 0) {
        failures.push('VALIDATED_NO_CHANGE requires deterministic checks to have actually executed.');
      }
      break;
    }
    case RESULTS.REGRESSED: {
      // A regression is a complete, valid, useful outcome — it just has to say why.
      if (!Array.isArray(receipt.result_reasons) || receipt.result_reasons.length === 0) {
        failures.push('result is REGRESSED but no reason was recorded.');
      }
      break;
    }
    case RESULTS.INCONCLUSIVE:
      failures.push(
        'result is INCONCLUSIVE — the run produced neither a measurable hardening delta '
        + 'nor a defensible no-change claim. Re-run the pack.',
      );
      break;
    default:
      failures.push(`unknown result: ${receipt.result}`);
  }

  if (receipt.discoveries?.total > 0 && receipt.result === RESULTS.IMPROVED) {
    const addressed = Object.values(receipt.hardening_added || {})
      .reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
    if (addressed === 0) {
      warnings.push('discoveries recorded but no hardening object references them.');
    }
  }
  if (signature && signature.signed === false) {
    warnings.push('receipt is digest-only (unsigned); set ENGINE_HARDENING_SIGNING_KEY for attributable receipts.');
  }

  return {
    complete: failures.length === 0,
    status: failures.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    result: receipt.result,
    failures,
    warnings,
  };
}
