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

/* ------------------------------------------- regression counting granularity */
test('asserted test-case counts outrank counted test files', () => {
  // The defect this guards: a pack that adds 25 cases to files that already
  // existed changed no file count, so scoring on files alone reported no
  // hardening where real hardening had happened.
  const files = populatedState();
  const cases = populatedState();
  cases.measurement.regression_test_cases = 60;
  cases.measurement.regression_test_cases_passing = 60;

  const a = score(files).components.find((c) => c.id === 'regression_depth');
  const b = score(cases).components.find((c) => c.id === 'regression_depth');
  assert.ok(b.points > a.points, 'more test cases scores deeper than two test files');
  assert.match(b.notes.join(' '), /60 test case\(s\)/);
  assert.match(a.notes.join(' '), /test file\(s\)/);
});

test('counting cases raises depth where counting files understated it', () => {
  // Two test files across two detectors reads as density 1.0/detector against a
  // target of 3. The same suite counted as cases is far past the target. The
  // fix is about measuring the right thing, not about inflating the result.
  const byFiles = populatedState();
  const byCases = populatedState();
  byCases.measurement.regression_test_cases = 547;
  byCases.measurement.regression_test_cases_passing = 547;
  const density = (s) => score(s).components.find((c) => c.id === 'regression_depth')
    .terms.find((t) => t.label === 'Test density vs target').value;
  assert.ok(density(byFiles) < 1, 'file granularity understates a large suite');
  assert.equal(density(byCases), 1, 'case granularity reaches the target');
});

test('a component already at ceiling does not move, and that is correct', () => {
  // The AB 2013 shape: 547 -> 572 cases, no new test files. Density is clamped
  // at the target either side, so regression depth genuinely does not change.
  // Recording a real zero beats manufacturing a delta that is not there.
  const before = populatedState();
  before.measurement.regression_test_cases = 547;
  before.measurement.regression_test_cases_passing = 547;
  const after = populatedState();
  after.measurement.regression_test_cases = 572;
  after.measurement.regression_test_cases_passing = 572;
  assert.equal(after.controls.regression_tests.length, before.controls.regression_tests.length);
  const d = computeDelta(before, after);
  const depth = d.score.components.find((c) => c.id === 'regression_depth');
  assert.equal(depth.change, 0, 'saturated density cannot rise further');
  assert.equal(depth.after, depth.before);
});

test('failing cases are counted against the pass rate', () => {
  const red = populatedState();
  red.measurement.regression_test_cases = 100;
  red.measurement.regression_test_cases_passing = 90;
  const c = score(red).components.find((c) => c.id === 'regression_depth');
  assert.match(c.notes.join(' '), /10 regression test\(s\) are not passing/);
});

/* --------------------------------------------- provenance applicability */
test('an inapplicable authority link does not count as missing provenance', () => {
  // The defect this guards: adding a genuine provenance control that happens to
  // be code lowered the provenance score, because a Python module has no
  // statutory citation to link to.
  const withCode = populatedState();
  withCode.controls.provenance_controls = [
    { id: 'pv.pack', has_source: true, has_hash: true, has_timestamp: true, has_authority_link: true },
    {
      id: 'pv.code',
      has_source: true, has_hash: true, has_timestamp: true,
      has_authority_link: false, authority_link_applicable: false,
    },
  ];
  const c = score(withCode).components.find((x) => x.id === 'provenance');
  assert.equal(c.points, 5, 'both controls count as complete');
});

test('inapplicability does not waive source, hash or timestamp', () => {
  const sloppy = populatedState();
  sloppy.controls.provenance_controls = [{
    id: 'pv.code',
    has_source: true, has_hash: false, has_timestamp: true,
    has_authority_link: false, authority_link_applicable: false,
  }];
  const c = score(sloppy).components.find((x) => x.id === 'provenance');
  assert.equal(c.points, 0, 'a missing hash still fails, applicability or not');
});

test('adding a provenance control never lowers the provenance score', () => {
  const before = populatedState();
  before.controls.provenance_controls = [
    { id: 'pv.pack', has_source: true, has_hash: true, has_timestamp: true, has_authority_link: true },
  ];
  const after = structuredClone(before);
  after.controls.provenance_controls.push({
    id: 'pv.verifier',
    has_source: true, has_hash: true, has_timestamp: true,
    has_authority_link: false, authority_link_applicable: false,
  });
  const a = score(before).components.find((x) => x.id === 'provenance').points;
  const b = score(after).components.find((x) => x.id === 'provenance').points;
  assert.ok(b >= a, 'adding a well-formed control cannot regress the score');
});
