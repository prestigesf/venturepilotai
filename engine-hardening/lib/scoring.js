/**
 * scoring.js — ENGINE STRENGTH SCORE, 100 points, measurable fields only.
 *
 *   20  Rule / authority coverage
 *   20  Detector coverage
 *   15  Regression depth
 *   15  Evidence reproducibility
 *   10  False-positive / false-negative performance
 *   10  Refusal / blocking integrity
 *    5  Provenance completeness
 *    5  Cross-product reuse
 *
 * Rules of the scorer:
 *   - Every component exposes the raw numbers behind it. A number that cannot
 *     be shown cannot be scored.
 *   - Unmeasured is 0, never full credit. An engine that has never run a
 *     labelled case does not get 10/10 on detection accuracy for having no
 *     recorded false positives.
 *   - Ratios are clamped to [0,1] so an over-reported numerator cannot buy
 *     more than the component is worth.
 */

import { rawInputs } from './raw.js';

const TARGET_TESTS_PER_DETECTOR = 3;

function ratio(numerator, denominator) {
  if (!denominator || denominator <= 0) return null; // null === unmeasured
  return Math.min(1, Math.max(0, numerator / denominator));
}

function term(label, value, weight, formula) {
  const measured = value !== null;
  return {
    label,
    formula,
    value: measured ? value : 0,
    measured,
    weight,
    weighted: measured ? value * weight : 0,
  };
}

function assemble(id, label, max, terms, raw, notes = []) {
  const weightSum = terms.reduce((s, t) => s + t.weight, 0);
  const achieved = terms.reduce((s, t) => s + t.weighted, 0);
  const fraction = weightSum > 0 ? achieved / weightSum : 0;
  const measuredTerms = terms.filter((t) => t.measured).length;
  return {
    id,
    label,
    max,
    points: round1(max * fraction),
    points_exact: max * fraction,
    fraction,
    measured: measuredTerms > 0,
    measured_terms: measuredTerms,
    total_terms: terms.length,
    terms: terms.map((t) => ({
      ...t,
      value: round3(t.value),
      contribution: round1((max * t.weighted) / (weightSum || 1)),
    })),
    raw,
    notes,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function v(raw, key) {
  return raw[key] ? raw[key].value : 0;
}

function basisMap(raw, keys) {
  const out = {};
  for (const k of keys) {
    out[k] = raw[k] ? { value: raw[k].value, basis: raw[k].basis } : { value: 0, basis: 'missing' };
  }
  return out;
}

/* ------------------------------------------------------------------ 1 / 20 */
function ruleAuthorityCoverage(raw) {
  const keys = [
    'rules_total', 'rules_evaluated', 'rules_unsupported',
    'authority_sources_required', 'authority_sources_used',
    'authority_mappings', 'ambiguous_authority_mappings',
  ];
  const rulesTotal = v(raw, 'rules_total');
  const supported = Math.max(0, v(raw, 'rules_evaluated') - v(raw, 'rules_unsupported'));
  const authorityUsed = ratio(v(raw, 'authority_sources_used'), v(raw, 'authority_sources_required'));
  const mappings = v(raw, 'authority_mappings');
  const ambiguous = v(raw, 'ambiguous_authority_mappings');
  const unambiguous = mappings > 0 ? ratio(mappings - ambiguous, mappings) : null;

  const notes = [];
  if (!rulesTotal) notes.push('rules_total is 0 — no pack has declared a rule surface yet.');
  if (ambiguous > 0) notes.push(`${ambiguous} authority mapping(s) still marked ambiguous.`);

  return assemble('rule_coverage', 'Rule Coverage', 20, [
    term('Rules supported / rules in pack', ratio(supported, rulesTotal), 0.5,
      '(rules_evaluated - rules_unsupported) / rules_total'),
    term('Authority sources mapped', authorityUsed, 0.3,
      'authority_sources_used / authority_sources_required'),
    term('Unambiguous authority mappings', unambiguous, 0.2,
      '(authority_mappings - ambiguous) / authority_mappings'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------ 2 / 20 */
function detectorCoverage(raw) {
  const keys = [
    'failure_modes_known', 'failure_modes_with_detector',
    'active_detectors', 'deterministic_detectors',
  ];
  const known = v(raw, 'failure_modes_known');
  const covered = v(raw, 'failure_modes_with_detector');
  const detectors = v(raw, 'active_detectors');
  const deterministic = v(raw, 'deterministic_detectors');

  const notes = [];
  const uncovered = Math.max(0, known - covered);
  if (uncovered > 0) notes.push(`${uncovered} known failure mode(s) have no detector.`);
  if (detectors > 0 && deterministic < detectors) {
    notes.push(`${detectors - deterministic} detector(s) are heuristic, not deterministic.`);
  }

  return assemble('detector_coverage', 'Detector Coverage', 20, [
    term('Known failure modes with a detector', ratio(covered, known), 0.7,
      'failure_modes_with_detector / failure_modes_known'),
    term('Detectors that are deterministic', ratio(deterministic, detectors), 0.3,
      'deterministic_detectors / active_detectors'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------ 3 / 15 */
function regressionDepth(raw) {
  const keys = [
    'regression_tests', 'regression_tests_passing',
    'failure_modes_with_regression', 'failure_modes_known', 'active_detectors',
  ];
  const tests = v(raw, 'regression_tests');
  const passing = v(raw, 'regression_tests_passing');
  const known = v(raw, 'failure_modes_known');
  const regressed = v(raw, 'failure_modes_with_regression');
  const detectors = v(raw, 'active_detectors');
  const density = detectors > 0 ? ratio(tests / detectors, TARGET_TESTS_PER_DETECTOR) : null;

  const notes = [];
  const failing = tests - passing;
  if (failing > 0) notes.push(`${failing} regression test(s) are not passing.`);
  if (detectors > 0) {
    notes.push(`Test density ${(tests / detectors).toFixed(2)} per detector (target ${TARGET_TESTS_PER_DETECTOR}).`);
  }

  return assemble('regression_depth', 'Regression Depth', 15, [
    term('Known failure modes pinned by a regression test', ratio(regressed, known), 0.5,
      'failure_modes_with_regression / failure_modes_known'),
    term('Test density vs target', density, 0.3,
      '(regression_tests / active_detectors) / 3'),
    term('Regression tests passing', ratio(passing, tests), 0.2,
      'regression_tests_passing / regression_tests'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------ 4 / 15 */
function evidenceReproducibility(raw) {
  const keys = [
    'replay_runs', 'replay_identical',
    'evidence_fields_required', 'evidence_fields_populated', 'evidence_schemas',
    'deterministic_checks_total', 'deterministic_checks_executed',
  ];
  const notes = [];
  if (v(raw, 'replay_runs') === 0) {
    notes.push('No replay run recorded — reproducibility is unproven, not assumed.');
  }

  return assemble('evidence_quality', 'Evidence Quality', 15, [
    term('Replays that reproduced byte-identical evidence',
      ratio(v(raw, 'replay_identical'), v(raw, 'replay_runs')), 0.5,
      'replay_identical / replay_runs'),
    term('Required evidence fields populated',
      ratio(v(raw, 'evidence_fields_populated'), v(raw, 'evidence_fields_required')), 0.3,
      'evidence_fields_populated / evidence_fields_required'),
    term('Deterministic checks executed',
      ratio(v(raw, 'deterministic_checks_executed'), v(raw, 'deterministic_checks_total')), 0.2,
      'deterministic_checks_executed / deterministic_checks_total'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------ 5 / 10 */
function detectionAccuracy(raw) {
  const keys = ['labeled_cases', 'true_positives', 'false_positives', 'false_negatives'];
  const labeled = v(raw, 'labeled_cases');
  const tp = v(raw, 'true_positives');
  const fp = v(raw, 'false_positives');
  const fn = v(raw, 'false_negatives');

  let f1 = null;
  const notes = [];
  if (labeled <= 0) {
    notes.push('No labelled corpus — detection accuracy scores 0 until cases exist.');
  } else if (tp + fp + fn === 0) {
    notes.push('Labelled corpus present but no positives or errors recorded.');
  } else {
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    notes.push(`precision ${precision.toFixed(3)}, recall ${recall.toFixed(3)} over ${labeled} labelled case(s).`);
  }

  return assemble('detection_accuracy', 'Detection Accuracy', 10, [
    term('F1 over the labelled corpus', f1, 1,
      '2PR/(P+R) where P = tp/(tp+fp), R = tp/(tp+fn)'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------ 6 / 10 */
function blockingIntegrity(raw) {
  const keys = [
    'blocking_invariants', 'blocking_invariants_with_test',
    'refusal_conditions', 'refusal_conditions_exercised', 'bypasses_observed',
  ];
  const invariants = v(raw, 'blocking_invariants');
  const bypasses = v(raw, 'bypasses_observed');
  const base = assemble('blocking_integrity', 'Blocking Integrity', 10, [
    term('Blocking invariants with a test that proves they block',
      ratio(v(raw, 'blocking_invariants_with_test'), invariants), 0.5,
      'blocking_invariants_with_test / blocking_invariants'),
    term('Refusal conditions exercised by a test',
      ratio(v(raw, 'refusal_conditions_exercised'), v(raw, 'refusal_conditions')), 0.5,
      'refusal_conditions_exercised / refusal_conditions'),
  ], basisMap(raw, keys));

  // An observed bypass is evidence the gate did not hold. It scales the whole
  // component down rather than costing a fixed fraction of one term.
  const penalty = invariants > 0 ? Math.min(1, bypasses / invariants) : (bypasses > 0 ? 1 : 0);
  const factor = 1 - penalty;
  if (bypasses > 0) {
    base.notes.push(`${bypasses} observed bypass(es) — component scaled by ${factor.toFixed(2)}.`);
  }
  base.penalty = { bypasses_observed: bypasses, factor: round3(factor) };
  base.points_exact *= factor;
  base.points = round1(base.points_exact);
  base.fraction *= factor;
  return base;
}

/* ------------------------------------------------------------------- 7 / 5 */
function provenanceCompleteness(raw) {
  const keys = ['provenance_controls', 'provenance_controls_complete'];
  const total = v(raw, 'provenance_controls');
  const complete = v(raw, 'provenance_controls_complete');
  const notes = [];
  if (total > complete) {
    notes.push(`${total - complete} provenance control(s) missing source, hash, timestamp or authority link.`);
  }
  return assemble('provenance', 'Provenance', 5, [
    term('Artefact classes with full provenance', ratio(complete, total), 1,
      'provenance_controls_complete / provenance_controls (source + hash + timestamp + authority link)'),
  ], basisMap(raw, keys), notes);
}

/* ------------------------------------------------------------------- 8 / 5 */
function crossProductReuse(raw) {
  const keys = [
    'reusable_controls', 'reusable_controls_used_by_2plus',
    'products_registered', 'products_strengthened',
  ];
  return assemble('reuse', 'Reuse', 5, [
    term('Reusable controls actually used by 2+ products',
      ratio(v(raw, 'reusable_controls_used_by_2plus'), v(raw, 'reusable_controls')), 0.6,
      'reusable_controls_used_by_2plus / reusable_controls'),
    term('Registered products that inherited a control',
      ratio(v(raw, 'products_strengthened'), v(raw, 'products_registered')), 0.4,
      'products_strengthened / products_registered'),
  ], basisMap(raw, keys));
}

/**
 * Score an engine-state document.
 * @param {object} state
 * @returns {{total:number,total_exact:number,max:number,components:object[],raw:object,unmeasured:string[]}}
 */
export function score(state) {
  const raw = rawInputs(state);
  const components = [
    ruleAuthorityCoverage(raw),
    detectorCoverage(raw),
    regressionDepth(raw),
    evidenceReproducibility(raw),
    detectionAccuracy(raw),
    blockingIntegrity(raw),
    provenanceCompleteness(raw),
    crossProductReuse(raw),
  ];
  const totalExact = components.reduce((s, c) => s + c.points_exact, 0);
  return {
    engine_version: state.engine_version || null,
    total: round1(totalExact),
    total_exact: totalExact,
    max: components.reduce((s, c) => s + c.max, 0),
    components,
    raw,
    unmeasured: components.filter((c) => !c.measured).map((c) => c.id),
    scored_at_state_version: state.state_version ?? null,
  };
}

/**
 * Component-by-component difference between two scores.
 */
export function scoreDelta(before, after) {
  const byId = new Map(before.components.map((c) => [c.id, c]));
  return {
    before: before.total,
    after: after.total,
    change: round1(after.total_exact - before.total_exact),
    components: after.components.map((c) => {
      const b = byId.get(c.id);
      return {
        id: c.id,
        label: c.label,
        max: c.max,
        before: b ? b.points : 0,
        after: c.points,
        change: round1(c.points_exact - (b ? b.points_exact : 0)),
      };
    }),
  };
}

export { round1, TARGET_TESTS_PER_DETECTOR };
