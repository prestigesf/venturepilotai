/**
 * Tests for the Engine Hardening Layer.
 *
 * These are mostly adversarial: the layer's whole value is that it cannot be
 * talked into recording progress that did not happen, so most of what is
 * asserted here is what the layer REFUSES to do.
 *
 *   node --test engine-hardening/test/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  score, scoreDelta, computeDelta, computePropagation, buildReceipt, classify,
  checkCompleteness, appendReceipt, verifyLedger, headHash, EMPTY_LEDGER,
  canonicalize, sha256, signBody, verifyBody, renderReceipt, counters, RESULTS,
} from '../lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEY = 'test-key';

/* ---------------------------------------------------------------- fixtures */
function emptyState(overrides = {}) {
  return {
    engine_version: '0.1.0',
    state_version: 0,
    controls: {
      detectors: [], regression_tests: [], blocking_invariants: [], evidence_schemas: [],
      refusal_conditions: [], human_review_triggers: [], authority_mappings: [],
      provenance_controls: [], escalation_rules: [], reusable_controls: [], known_gaps: [],
    },
    measurement: {},
    products: [],
    ...overrides,
  };
}

function populatedState() {
  return emptyState({
    controls: {
      detectors: [
        { id: 'd1', name: 'D1', kind: 'deterministic', failure_modes: ['fm1'], products: ['p1'] },
        { id: 'd2', name: 'D2', kind: 'heuristic', failure_modes: ['fm2'], products: ['p1', 'p2'] },
      ],
      regression_tests: [
        { id: 't1', status: 'PASS', covers_detector: 'd1', covers_failure_mode: 'fm1' },
        { id: 't2', status: 'PASS', covers_detector: 'd2', covers_failure_mode: 'fm2' },
      ],
      blocking_invariants: [{ id: 'i1', statement: 'no', test_id: 't1', products: ['p1'] }],
      evidence_schemas: [{ id: 'e1', required_fields: ['a', 'b'], populated_fields: ['a'] }],
      refusal_conditions: [{ id: 'r1', condition: 'refuse', exercised_by_test: 't1' }],
      human_review_triggers: [{ id: 'h1', trigger: 'review' }],
      authority_mappings: [
        { id: 'a1', rule_id: 'R1', authority_source: 'S1', ambiguous: false },
        { id: 'a2', rule_id: 'R2', authority_source: 'S2', ambiguous: true },
      ],
      provenance_controls: [
        { id: 'pv1', has_source: true, has_hash: true, has_timestamp: true, has_authority_link: true },
        { id: 'pv2', has_source: true, has_hash: false, has_timestamp: true, has_authority_link: true },
      ],
      escalation_rules: [],
      reusable_controls: [
        { id: 'rc1', control_ref: 'd1', products: ['p1'] },
        { id: 'rc2', control_ref: 'd2', products: ['p1', 'p2'] },
      ],
      known_gaps: [{ id: 'g1', description: 'gap', closed_by_pack: null }],
    },
    measurement: {
      rules_total: 10, rules_evaluated: 10, rules_unsupported: 1,
      authority_sources_required: 4, authority_sources_used: 2,
      failure_modes_known: 4,
      deterministic_checks_total: 10, deterministic_checks_executed: 10,
      replay_runs: 10, replay_identical: 9,
      labeled_cases: 100, true_positives: 80, false_positives: 10, false_negatives: 10,
      bypasses_observed: 0,
    },
    products: [
      { id: 'p1', name: 'P1', status: 'LIVE', inherited_controls: ['d1'], capabilities_unlocked: [] },
      { id: 'p2', name: 'P2', status: 'VALIDATING', inherited_controls: ['d2'], capabilities_unlocked: [] },
    ],
  });
}

function runRecord(overrides = {}) {
  return {
    pack_id: 'PACK_TEST', pack_version: '1.0.0', run_id: 'run-test-1',
    timestamp: '2026-06-01T00:00:00Z',
    starting_commit: 'aaaa1111', ending_commit: 'bbbb2222',
    rules_evaluated: ['R1', 'R2'],
    rules_unsupported: [],
    authority_sources_used: ['S1'],
    deterministic_checks_executed: ['c1', 'c2'],
    discoveries: {},
    ...overrides,
  };
}

/* ------------------------------------------------------------------ scoring */
test('an engine with nothing measured scores 0, not full marks', () => {
  const s = score(emptyState());
  assert.equal(s.total, 0);
  assert.equal(s.max, 100);
  assert.equal(s.unmeasured.length, 8, 'every component reports itself unmeasured');
});

test('no recorded false positives does not earn detection accuracy points', () => {
  const state = emptyState({ measurement: { labeled_cases: 0, false_positives: 0, false_negatives: 0 } });
  const accuracy = score(state).components.find((c) => c.id === 'detection_accuracy');
  assert.equal(accuracy.points, 0);
  assert.match(accuracy.notes.join(' '), /No labelled corpus/);
});

test('every component exposes the raw numbers behind it', () => {
  const s = score(populatedState());
  for (const c of s.components) {
    assert.ok(Object.keys(c.raw).length > 0, `${c.id} exposes raw inputs`);
    for (const [key, r] of Object.entries(c.raw)) {
      assert.ok(['derived', 'asserted', 'missing'].includes(r.basis), `${key} declares its basis`);
      assert.equal(typeof r.value, 'number');
    }
    for (const t of c.terms) assert.ok(t.formula, `${c.id} term "${t.label}" shows its formula`);
  }
});

test('component points always sum to the total and never exceed the maxima', () => {
  const s = score(populatedState());
  const sum = s.components.reduce((acc, c) => acc + c.points_exact, 0);
  assert.ok(Math.abs(sum - s.total_exact) < 1e-9);
  for (const c of s.components) {
    assert.ok(c.points_exact <= c.max + 1e-9, `${c.id} within its maximum`);
    assert.ok(c.points_exact >= 0, `${c.id} non-negative`);
  }
  assert.ok(s.total_exact <= 100);
});

test('over-reported numerators cannot buy more than a component is worth', () => {
  const state = populatedState();
  state.measurement.rules_evaluated = 10_000;
  state.measurement.authority_sources_used = 10_000;
  const rule = score(state).components.find((c) => c.id === 'rule_coverage');
  assert.ok(rule.points <= 20, 'clamped to the component maximum');
});

test('an observed bypass scales blocking integrity down', () => {
  const clean = score(populatedState()).components.find((c) => c.id === 'blocking_integrity');
  const breached = populatedState();
  breached.measurement.bypasses_observed = 1;
  const after = score(breached).components.find((c) => c.id === 'blocking_integrity');
  assert.ok(after.points < clean.points, 'a bypass costs points');
  assert.equal(after.penalty.bypasses_observed, 1);
});

test('an untested blocking invariant scores as unproven', () => {
  const proven = populatedState();
  const unproven = populatedState();
  unproven.controls.blocking_invariants[0].test_id = null;
  const a = score(proven).components.find((c) => c.id === 'blocking_integrity').points;
  const b = score(unproven).components.find((c) => c.id === 'blocking_integrity').points;
  assert.ok(b < a, 'an invariant with no test proving it blocks scores lower');
});

/* -------------------------------------------------------------------- delta */
test('the delta is diffed from the inventory, not from what the pack claims', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: ['fm3'], products: ['p2'] });
  const delta = computeDelta(before, after);
  assert.equal(delta.categories.detectors.added_count, 1);
  assert.equal(delta.categories.detectors.net, 1);
  assert.equal(delta.is_measurable, true);
});

test('an identical state produces no measurable delta', () => {
  const delta = computeDelta(populatedState(), populatedState());
  assert.equal(delta.is_measurable, false);
  assert.equal(delta.totals.controls_added, 0);
  assert.equal(delta.score.change, 0);
});

test('closing a gap is a measurable delta on its own', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.known_gaps[0].closed_by_pack = 'PACK_TEST';
  const delta = computeDelta(before, after);
  assert.equal(delta.gaps.closed_count, 1);
  assert.equal(delta.is_measurable, true);
});

/* -------------------------------------------------------------- propagation */
test('a product only inherits a control that names it', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: ['fm3'], products: ['p2'] });
  const prop = computePropagation(computeDelta(before, after), after);
  assert.equal(prop.by_product.p2.verdict, 'STRENGTHENED');
  assert.equal(prop.by_product.p1.verdict, 'NO_CHANGE');
});

test('an unregistered product id is ignored, not invented', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: [], products: ['ghost-product'] });
  const prop = computePropagation(computeDelta(before, after), after);
  assert.equal(prop.by_product['ghost-product'], undefined);
  assert.equal(prop.summary.length, 2);
});

/* ---------------------------------------------------------- classification */
test('a run that evaluated nothing is INCONCLUSIVE', () => {
  const state = populatedState();
  const run = runRecord({ rules_evaluated: [], deterministic_checks_executed: [] });
  const verdict = classify(computeDelta(state, state), run, state);
  assert.equal(verdict.result, RESULTS.INCONCLUSIVE);
});

test('a failing regression test makes the run REGRESSED even when controls were added', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: ['fm3'], products: [] });
  after.controls.regression_tests[0].status = 'FAIL';
  const verdict = classify(computeDelta(before, after), runRecord(), after);
  assert.equal(verdict.result, RESULTS.REGRESSED);
});

test('removing a control is REGRESSED', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.pop();
  const verdict = classify(computeDelta(before, after), runRecord(), after);
  assert.equal(verdict.result, RESULTS.REGRESSED);
});

test('recording a new known gap is discovery, not a regression', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.known_gaps.push({ id: 'g2', description: 'newly found', closed_by_pack: null });
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: ['fm3'], products: [] });
  const verdict = classify(computeDelta(before, after), runRecord(), after);
  assert.equal(verdict.result, RESULTS.IMPROVED);
  assert.match(verdict.reasons.join(' '), /discovery, not a regression/);
});

test('findings with no hardening are INCONCLUSIVE, not a quiet pass', () => {
  const state = populatedState();
  const run = runRecord({ discoveries: { new_failure_modes: [{ id: 'fm9', description: 'found something' }] } });
  const verdict = classify(computeDelta(state, state), run, state);
  assert.equal(verdict.result, RESULTS.INCONCLUSIVE);
});

test('an unchanged engine that genuinely re-ran its controls is VALIDATED_NO_CHANGE', () => {
  const state = populatedState();
  const verdict = classify(computeDelta(state, state), runRecord(), state);
  assert.equal(verdict.result, RESULTS.VALIDATED_NO_CHANGE);
});

/* ------------------------------------------------------- the one hard rule */
test('an INCONCLUSIVE run is never complete', () => {
  const state = populatedState();
  const receipt = buildReceipt({
    run: runRecord({ rules_evaluated: [], deterministic_checks_executed: [] }),
    beforeState: state, afterState: state, signingKey: KEY,
  });
  const gate = checkCompleteness(receipt, { signingKey: KEY });
  assert.equal(gate.complete, false);
  assert.match(gate.failures.join(' '), /INCONCLUSIVE/);
});

test('VALIDATED_NO_CHANGE without a signature is INCOMPLETE', () => {
  const state = populatedState();
  const receipt = buildReceipt({ run: runRecord(), beforeState: state, afterState: state, signingKey: undefined });
  assert.equal(receipt.result, RESULTS.VALIDATED_NO_CHANGE);
  const gate = checkCompleteness(receipt, { signingKey: undefined });
  assert.equal(gate.complete, false);
  assert.match(gate.failures.join(' '), /must be signed/);
});

test('VALIDATED_NO_CHANGE with a signature is COMPLETE', () => {
  const state = populatedState();
  const receipt = buildReceipt({ run: runRecord(), beforeState: state, afterState: state, signingKey: KEY });
  const gate = checkCompleteness(receipt, { signingKey: KEY });
  assert.equal(gate.complete, true, gate.failures.join('; '));
});

test('IMPROVED cannot be recorded without a delta the inventory can prove', () => {
  const state = populatedState();
  const receipt = buildReceipt({ run: runRecord(), beforeState: state, afterState: state, signingKey: KEY });
  const forged = { ...receipt, result: RESULTS.IMPROVED };
  const gate = checkCompleteness(forged, { signingKey: KEY });
  assert.equal(gate.complete, false);
  assert.match(gate.failures.join(' '), /no fake improvement/);
});

test('a run missing its commit range is INCOMPLETE', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: [], products: [] });
  const receipt = buildReceipt({
    run: runRecord({ ending_commit: null }), beforeState: before, afterState: after, signingKey: KEY,
  });
  const gate = checkCompleteness(receipt, { signingKey: KEY });
  assert.equal(gate.complete, false);
  assert.match(gate.failures.join(' '), /ending_commit/);
});

test('a REGRESSED run is complete — a regression is a real result', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.pop();
  const receipt = buildReceipt({ run: runRecord(), beforeState: before, afterState: after, signingKey: KEY });
  assert.equal(receipt.result, RESULTS.REGRESSED);
  const gate = checkCompleteness(receipt, { signingKey: KEY });
  assert.equal(gate.complete, true, gate.failures.join('; '));
});

/* ------------------------------------------------------ signing and chaining */
test('canonicalisation is key-order independent', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.notEqual(canonicalize({ a: [1, 2] }), canonicalize({ a: [2, 1] }));
});

test('editing a receipt body breaks its digest', () => {
  const body = { pack_id: 'PACK_TEST', result: 'IMPROVED' };
  const sig = signBody(body, KEY);
  assert.equal(verifyBody(body, sig, KEY).ok, true);
  assert.equal(verifyBody({ ...body, result: 'VALIDATED_NO_CHANGE' }, sig, KEY).ok, false);
});

test('a wrong signing key fails verification', () => {
  const body = { pack_id: 'PACK_TEST' };
  const sig = signBody(body, KEY);
  const check = verifyBody(body, sig, 'other-key');
  assert.equal(check.ok, false);
  assert.match(check.reason, /signature mismatch/);
});

test('an unsigned receipt says so rather than claiming to be signed', () => {
  const sig = signBody({ a: 1 }, undefined);
  assert.equal(sig.signed, false);
  assert.equal(sig.signature, null);
  assert.equal(sig.algorithm, 'SHA-256');
});

test('the ledger rejects a broken chain link', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: [], products: [] });
  const receipt = buildReceipt({
    run: runRecord(), beforeState: before, afterState: after,
    previousHash: 'f'.repeat(64), signingKey: KEY,
  });
  assert.throws(() => appendReceipt(EMPTY_LEDGER, receipt), /chain break/);
});

test('the ledger rejects a duplicate run_id', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: [], products: [] });
  const receipt = buildReceipt({ run: runRecord(), beforeState: before, afterState: after, signingKey: KEY });
  const ledger = appendReceipt(EMPTY_LEDGER, receipt);
  const second = buildReceipt({
    run: runRecord(), beforeState: before, afterState: after,
    previousHash: headHash(ledger), signingKey: KEY,
  });
  assert.throws(() => appendReceipt(ledger, second), /append-only/);
});

test('rewriting a recorded receipt is caught by verifyLedger', async () => {
  const ledger = JSON.parse(await readFile(join(HERE, '..', 'examples', 'example-ledger.json'), 'utf8'));
  const tampered = structuredClone(ledger);
  tampered.receipts[3].strength.after = 99.9;
  const result = verifyLedger(tampered, { signingKey: 'example-signing-key-not-a-secret' });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /receipt_hash does not match/);
});

/* ------------------------------------------------------------ worked example */
test('the shipped example ledger verifies end to end', async () => {
  const ledger = JSON.parse(await readFile(join(HERE, '..', 'examples', 'example-ledger.json'), 'utf8'));
  const result = verifyLedger(ledger, { signingKey: 'example-signing-key-not-a-secret' });
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.ok(result.receipts >= 12);
});

test('the example is labelled as illustrative, and the live state is empty', async () => {
  const example = JSON.parse(await readFile(join(HERE, '..', 'examples', 'example-state.json'), 'utf8'));
  const live = JSON.parse(await readFile(join(HERE, '..', 'state', 'engine-state.json'), 'utf8'));
  assert.equal(example.data_class, 'ILLUSTRATIVE_EXAMPLE');
  assert.equal(live.data_class, 'LIVE');
  assert.equal(score(live).total, 0, 'the live engine claims nothing it has not measured');
});

test('the example score curve is monotonic across the recorded packs', async () => {
  const ledger = JSON.parse(await readFile(join(HERE, '..', 'examples', 'example-ledger.json'), 'utf8'));
  let previous = -1;
  for (const r of ledger.receipts) {
    assert.equal(r.strength.before, previous === -1 ? 0 : previous, `${r.pack_id} starts where the last pack ended`);
    previous = r.strength.after;
  }
});

/* ---------------------------------------------------------------- rendering */
test('the text receipt carries every section of the specified layout', () => {
  const before = populatedState();
  const after = populatedState();
  after.controls.detectors.push({ id: 'd3', name: 'D3', kind: 'deterministic', failure_modes: ['fm3'], products: ['p1'] });
  const text = renderReceipt(buildReceipt({ run: runRecord(), beforeState: before, afterState: after, signingKey: KEY }));
  for (const section of [
    'ENGINE DELTA RECEIPT', 'PACK COVERAGE', 'BEFORE', 'DISCOVERIES', 'HARDENING ADDED',
    'AFTER', 'ENGINE DELTA', 'PRODUCT PROPAGATION', 'STRENGTH', 'RESULT', 'ATTESTATION',
  ]) {
    assert.ok(text.includes(section), `receipt contains ${section}`);
  }
});

test('counters count the inventory rather than trusting a declared number', () => {
  const state = populatedState();
  state.controls.detectors.push({ id: 'd9', name: 'D9', kind: 'deterministic', failure_modes: [], products: [] });
  assert.equal(counters(state).active_detectors, 3);
  assert.equal(counters(state).known_gaps, 1, 'closed gaps are not counted as open');
});

test('scoreDelta reports per-component movement', () => {
  const before = score(emptyState());
  const after = score(populatedState());
  const delta = scoreDelta(before, after);
  assert.equal(delta.before, 0);
  assert.ok(delta.change > 0);
  assert.equal(delta.components.length, 8);
});
