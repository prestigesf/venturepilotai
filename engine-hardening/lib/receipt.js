/**
 * receipt.js — build an ENGINE DELTA RECEIPT for one pack run.
 *
 * PACK IN -> DELTA OUT. The receipt answers four questions and nothing else:
 *   1. What did this pack test?            -> PACK COVERAGE
 *   2. What did it reveal?                 -> DISCOVERIES
 *   3. What permanent hardening was gained -> HARDENING ADDED + ENGINE DELTA
 *   4. Which products inherited the gain?  -> PRODUCT PROPAGATION
 */

import { computeDelta } from './delta.js';
import { computePropagation } from './propagation.js';
import { counters } from './raw.js';
import { GENESIS_HASH, canonicalize, sha256, signBody } from './canonical.js';

export const RESULTS = {
  IMPROVED: 'IMPROVED',
  VALIDATED_NO_CHANGE: 'VALIDATED_NO_CHANGE',
  REGRESSED: 'REGRESSED',
  INCONCLUSIVE: 'INCONCLUSIVE',
};

const DISCOVERY_KINDS = [
  'new_failure_modes', 'new_edge_cases', 'false_positives', 'false_negatives',
  'ambiguous_authority_mappings', 'missing_provenance', 'missing_refusal_conditions',
];

function list(v) {
  return Array.isArray(v) ? v : [];
}

/** Prefer the run's own declared list; fall back to the asserted measurement. */
function count(run, key, measurement) {
  if (Array.isArray(run[key])) return run[key].length;
  const asserted = measurement[key];
  return typeof asserted === 'number' && asserted > 0 ? asserted : 0;
}

function packCoverage(run, afterState) {
  const m = afterState.measurement || {};
  return {
    rules_evaluated: list(run.rules_evaluated),
    rules_unsupported: list(run.rules_unsupported),
    authority_sources_used: list(run.authority_sources_used),
    deterministic_checks_executed: list(run.deterministic_checks_executed),
    counts: {
      // A declared list wins even when it is empty: "the pack listed zero
      // unsupported rules" is a different claim from "nobody said".
      rules_evaluated: count(run, 'rules_evaluated', m),
      rules_unsupported: count(run, 'rules_unsupported', m),
      authority_sources_used: count(run, 'authority_sources_used', m),
      deterministic_checks_executed: count(run, 'deterministic_checks_executed', m),
    },
  };
}

function discoveries(run) {
  const d = run.discoveries || {};
  const out = {};
  let total = 0;
  for (const kind of DISCOVERY_KINDS) {
    out[kind] = list(d[kind]);
    total += out[kind].length;
  }
  out.total = total;
  return out;
}

function hardeningAdded(delta) {
  const c = delta.categories;
  const pick = (key) => c[key].added.map((x) => ({ id: x.id, name: x.name || x.statement || x.condition || x.id }));
  return {
    detectors: pick('detectors'),
    regression_tests: pick('regression_tests'),
    blocking_invariants: pick('blocking_invariants'),
    authority_mappings: pick('authority_mappings'),
    evidence_fields: pick('evidence_schemas'),
    refusal_conditions: pick('refusal_conditions'),
    provenance_controls: pick('provenance_controls'),
    escalation_rules: pick('escalation_rules'),
    reusable_controls: pick('reusable_controls'),
    gaps_closed: delta.gaps.closed.map((g) => ({ id: g.id, description: g.description })),
  };
}

/**
 * Decide the RESULT from evidence only. Order matters: a run that both added
 * a detector and lost an invariant is REGRESSED, not IMPROVED.
 */
export function classify(delta, run, afterState) {
  const reasons = [];
  const cov = packCoverage(run, afterState).counts;
  const disc = discoveries(run);

  const ranSomething = cov.rules_evaluated > 0 || cov.deterministic_checks_executed > 0;
  if (!ranSomething) {
    reasons.push('No rules evaluated and no deterministic checks executed — the pack did not run.');
    return { result: RESULTS.INCONCLUSIVE, reasons };
  }

  const failingTests = (afterState.controls?.regression_tests || []).filter((t) => t.status === 'FAIL');
  const bypasses = afterState.measurement?.bypasses_observed || 0;
  const controlsRemoved = delta.totals.controls_removed;
  const scoreChange = delta.score.change;

  if (failingTests.length > 0) reasons.push(`${failingTests.length} regression test(s) failing after the run.`);
  if (bypasses > 0) reasons.push(`${bypasses} blocking bypass(es) observed.`);
  // Recording a new known gap is discovery, not decay: the engine did not get
  // weaker, it got more honest about what it does not cover. It is reported but
  // never counted as a regression.
  if (delta.gaps.opened_count > 0) {
    reasons.push(`${delta.gaps.opened_count} new known gap(s) recorded (discovery, not a regression).`);
  }
  if (controlsRemoved > 0) reasons.push(`${controlsRemoved} control(s) removed from the inventory.`);
  if (scoreChange < -0.05) reasons.push(`Strength score fell ${Math.abs(scoreChange).toFixed(1)} point(s).`);

  const regressed = failingTests.length > 0 || bypasses > 0 || controlsRemoved > 0 || scoreChange < -0.05;
  if (regressed) return { result: RESULTS.REGRESSED, reasons };

  if (delta.is_measurable && delta.totals.controls_added + delta.totals.gaps_closed > 0) {
    reasons.push(`${delta.totals.controls_added} control(s) added, ${delta.totals.gaps_closed} gap(s) closed.`);
    if (scoreChange !== 0) reasons.push(`Strength score moved ${scoreChange >= 0 ? '+' : ''}${scoreChange}.`);
    return { result: RESULTS.IMPROVED, reasons };
  }

  // Nothing new. That is a real result only if the existing controls were
  // genuinely exercised by this pack.
  const exercised = cov.deterministic_checks_executed > 0
    && (afterState.controls?.regression_tests || []).some((t) => t.status === 'PASS');
  if (!exercised) {
    reasons.push('No hardening delta and no evidence the existing controls were exercised.');
    return { result: RESULTS.INCONCLUSIVE, reasons };
  }
  if (disc.total > 0) {
    reasons.push(`${disc.total} discovery(ies) recorded but no hardening added — the findings are unaddressed.`);
    return { result: RESULTS.INCONCLUSIVE, reasons };
  }
  reasons.push(
    `Existing controls survived an independent rule set: ${cov.rules_evaluated} rule(s) evaluated, `
    + `${cov.deterministic_checks_executed} deterministic check(s) executed, no new failure mode found.`,
  );
  return { result: RESULTS.VALIDATED_NO_CHANGE, reasons };
}

/**
 * Build a complete, signed, chained receipt.
 *
 * @param {object} args
 * @param {object} args.run            pack run record (coverage + discoveries + commits)
 * @param {object} args.beforeState    engine state before the run
 * @param {object} args.afterState     engine state after the run
 * @param {string} [args.previousHash] digest of the previous receipt in the ledger
 * @param {string} [args.signingKey]
 */
export function buildReceipt({ run, beforeState, afterState, previousHash = GENESIS_HASH, signingKey }) {
  const delta = computeDelta(beforeState, afterState);
  const propagation = computePropagation(delta, { ...afterState, last_pack_id: run.pack_id });
  const verdict = classify(delta, run, afterState);

  const body = {
    receipt_version: '1.0.0',
    engine_version: afterState.engine_version || null,
    pack_id: run.pack_id,
    pack_version: run.pack_version || null,
    run_id: run.run_id,
    timestamp: run.timestamp,
    starting_commit: run.starting_commit || null,
    ending_commit: run.ending_commit || null,
    previous_receipt_hash: previousHash,

    pack_coverage: packCoverage(run, afterState),
    before: counters(beforeState),
    discoveries: discoveries(run),
    hardening_added: hardeningAdded(delta),
    after: counters(afterState),

    engine_delta: {
      detectors: delta.categories.detectors.net,
      regression_tests: delta.categories.regression_tests.net,
      blocking_invariants: delta.categories.blocking_invariants.net,
      authority_mappings: delta.categories.authority_mappings.net,
      reusable_controls: delta.categories.reusable_controls.net,
      refusal_conditions: delta.categories.refusal_conditions.net,
      provenance_controls: delta.categories.provenance_controls.net,
      escalation_rules: delta.categories.escalation_rules.net,
      evidence_schemas: delta.categories.evidence_schemas.net,
      human_review_triggers: delta.categories.human_review_triggers.net,
      known_gaps: delta.gaps.net,
      is_measurable: delta.is_measurable,
    },

    product_propagation: propagation.summary.map((p) => ({
      product_id: p.id,
      product: p.name,
      status: p.status,
      verdict: p.verdict,
      inherited: p.inherited_this_run,
      unlocked: p.unlocked_this_run,
    })),

    strength: {
      before: delta.score.before,
      after: delta.score.after,
      change: delta.score.change,
      components: delta.score.components,
      breakdown_after: delta.scores.after.components.map((c) => ({
        id: c.id,
        label: c.label,
        points: c.points,
        max: c.max,
        measured: c.measured,
        terms: c.terms,
        raw: c.raw,
        notes: c.notes,
        ...(c.penalty ? { penalty: c.penalty } : {}),
      })),
      unmeasured_components: delta.scores.after.unmeasured,
    },

    result: verdict.result,
    result_reasons: verdict.reasons,
  };

  const signature = signBody(body, signingKey);
  const receipt = { ...body, signature };
  receipt.receipt_hash = sha256(canonicalize(receipt));
  return receipt;
}

export { DISCOVERY_KINDS, discoveries, packCoverage };
