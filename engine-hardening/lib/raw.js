/**
 * raw.js — derive every measurable input the strength score is allowed to use.
 *
 * Two classes of number exist here and they are never blended silently:
 *
 *   DERIVED  — counted directly from the control inventory in engine-state.json.
 *              Cannot be inflated without adding a real control object.
 *   ASSERTED — supplied by a pack run in state.measurement.*.
 *              Can be wrong, so every asserted number is labelled as such and
 *              surfaced in the widget behind the score component that uses it.
 *
 * Nothing in this module invents a default that flatters the engine. A missing
 * measurement is 0 with measured=false, never "assume it passed".
 */

const DERIVED = 'derived';
const ASSERTED = 'asserted';

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function derived(value) {
  return { value: num(value), basis: DERIVED };
}

function asserted(measurement, key) {
  const present = Object.prototype.hasOwnProperty.call(measurement, key)
    && typeof measurement[key] === 'number'
    && Number.isFinite(measurement[key]);
  return { value: present ? num(measurement[key]) : 0, basis: ASSERTED, present };
}

/**
 * Count the controls in a state document.
 * @param {object} state engine-state document
 */
export function inventory(state) {
  const c = state.controls || {};
  const detectors = arr(c.detectors);
  const regressionTests = arr(c.regression_tests);
  const invariants = arr(c.blocking_invariants);
  const evidenceSchemas = arr(c.evidence_schemas);
  const refusals = arr(c.refusal_conditions);
  const humanReview = arr(c.human_review_triggers);
  const authority = arr(c.authority_mappings);
  const provenance = arr(c.provenance_controls);
  const escalation = arr(c.escalation_rules);
  const reusable = arr(c.reusable_controls);
  const gaps = arr(c.known_gaps).filter((g) => !g.closed_by_pack);

  return {
    detectors,
    regressionTests,
    invariants,
    evidenceSchemas,
    refusals,
    humanReview,
    authority,
    provenance,
    escalation,
    reusable,
    openGaps: gaps,
    allGaps: arr(c.known_gaps),
  };
}

/**
 * Headline counters used by the BEFORE / AFTER blocks of a receipt.
 */
export function counters(state) {
  const inv = inventory(state);
  return {
    active_detectors: inv.detectors.length,
    regression_tests: inv.regressionTests.length,
    blocking_invariants: inv.invariants.length,
    evidence_schemas: inv.evidenceSchemas.length,
    known_gaps: inv.openGaps.length,
    human_review_triggers: inv.humanReview.length,
    reusable_controls: inv.reusable.length,
    authority_mappings: inv.authority.length,
    refusal_conditions: inv.refusals.length,
    provenance_controls: inv.provenance.length,
    escalation_rules: inv.escalation.length,
  };
}

/**
 * Every raw input the scorer may read, each tagged derived|asserted.
 * @param {object} state engine-state document
 */
export function rawInputs(state) {
  const inv = inventory(state);
  const m = state.measurement || {};
  const products = arr(state.products);

  const deterministicDetectors = inv.detectors.filter((d) => d.kind === 'deterministic');
  const coveredFailureModes = new Set();
  for (const d of inv.detectors) for (const fm of arr(d.failure_modes)) coveredFailureModes.add(fm);

  const regressedFailureModes = new Set();
  const passingTests = inv.regressionTests.filter((t) => t.status === 'PASS');
  for (const t of inv.regressionTests) {
    if (t.covers_failure_mode) regressedFailureModes.add(t.covers_failure_mode);
  }

  const ambiguousAuthority = inv.authority.filter((a) => a.ambiguous === true);
  const invariantsWithTest = inv.invariants.filter((i) => Boolean(i.test_id));
  const refusalsExercised = inv.refusals.filter((r) => Boolean(r.exercised_by_test));

  let requiredEvidenceFields = 0;
  let populatedEvidenceFields = 0;
  for (const s of inv.evidenceSchemas) {
    const required = arr(s.required_fields);
    const populated = new Set(arr(s.populated_fields));
    requiredEvidenceFields += required.length;
    populatedEvidenceFields += required.filter((f) => populated.has(f)).length;
  }

  // An artefact class that no statutory authority governs cannot be faulted for
  // lacking an authority link. Marking the flag inapplicable is a statement
  // about the artefact, not a waiver: source, hash and timestamp are still
  // required. Without this, adding a genuine provenance control that happens to
  // be code lowers the provenance score.
  const completeProvenance = inv.provenance.filter(
    (p) => p.has_source && p.has_hash && p.has_timestamp
      && (p.has_authority_link || p.authority_link_applicable === false),
  );

  const reusedAcrossProducts = inv.reusable.filter((r) => arr(r.products).length >= 2);
  const strengthenedProducts = products.filter((p) => arr(p.inherited_controls).length > 0);

  return {
    // 1 — rule / authority coverage
    rules_total: asserted(m, 'rules_total'),
    rules_evaluated: asserted(m, 'rules_evaluated'),
    rules_unsupported: asserted(m, 'rules_unsupported'),
    authority_sources_required: asserted(m, 'authority_sources_required'),
    authority_sources_used: asserted(m, 'authority_sources_used'),
    authority_mappings: derived(inv.authority.length),
    ambiguous_authority_mappings: derived(ambiguousAuthority.length),

    // 2 — detector coverage
    failure_modes_known: asserted(m, 'failure_modes_known'),
    active_detectors: derived(inv.detectors.length),
    deterministic_detectors: derived(deterministicDetectors.length),
    failure_modes_with_detector: derived(coveredFailureModes.size),

    // 3 — regression depth
    //
    // Two granularities exist and they are not interchangeable. The inventory
    // counts test FILES, because that is what a frozen baseline can name. A
    // suite reports test CASES, which is the number that actually moves when a
    // pack hardens existing files. Where a run asserts the case counts, they
    // are preferred; otherwise the file counts stand in and the scorer says so.
    regression_tests: derived(inv.regressionTests.length),
    regression_tests_passing: derived(passingTests.length),
    regression_test_cases: asserted(m, 'regression_test_cases'),
    regression_test_cases_passing: asserted(m, 'regression_test_cases_passing'),
    failure_modes_with_regression: derived(regressedFailureModes.size),

    // 4 — evidence reproducibility
    evidence_schemas: derived(inv.evidenceSchemas.length),
    evidence_fields_required: derived(requiredEvidenceFields),
    evidence_fields_populated: derived(populatedEvidenceFields),
    replay_runs: asserted(m, 'replay_runs'),
    replay_identical: asserted(m, 'replay_identical'),
    deterministic_checks_total: asserted(m, 'deterministic_checks_total'),
    deterministic_checks_executed: asserted(m, 'deterministic_checks_executed'),

    // 5 — detection accuracy
    labeled_cases: asserted(m, 'labeled_cases'),
    true_positives: asserted(m, 'true_positives'),
    false_positives: asserted(m, 'false_positives'),
    false_negatives: asserted(m, 'false_negatives'),

    // 6 — refusal / blocking integrity
    blocking_invariants: derived(inv.invariants.length),
    blocking_invariants_with_test: derived(invariantsWithTest.length),
    refusal_conditions: derived(inv.refusals.length),
    refusal_conditions_exercised: derived(refusalsExercised.length),
    bypasses_observed: asserted(m, 'bypasses_observed'),

    // 7 — provenance completeness
    provenance_controls: derived(inv.provenance.length),
    provenance_controls_complete: derived(completeProvenance.length),

    // 8 — cross-product reuse
    reusable_controls: derived(inv.reusable.length),
    reusable_controls_used_by_2plus: derived(reusedAcrossProducts.length),
    products_registered: derived(products.length),
    products_strengthened: derived(strengthenedProducts.length),

    // context
    known_gaps: derived(inv.openGaps.length),
  };
}

export { DERIVED, ASSERTED };
