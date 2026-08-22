#!/usr/bin/env node
/**
 * build-example.mjs — regenerate the worked example.
 *
 * The pack contents below are ILLUSTRATIVE: they describe a plausible engine,
 * not a measured one. Everything derived from them is real — every score,
 * every delta, every RESULT and every signature is produced by the same
 * library the live CLI uses, and every receipt passes the same completeness
 * gate. Nothing in the output ledger is hand-typed.
 *
 *   node engine-hardening/examples/build-example.mjs
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReceipt, checkCompleteness, appendReceipt, verifyLedger, history,
  headHash, writeJson, EMPTY_LEDGER, score, productSurface, renderSummary,
} from '../lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNING_KEY = 'example-signing-key-not-a-secret';

/* ---------------------------------------------------------------- helpers */
const det = (id, name, failureModes, products = [], kind = 'deterministic') =>
  ({ id, name, kind, failure_modes: failureModes, products });

const tests = (prefix, n, detector, failureMode) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}.${String(i + 1).padStart(2, '0')}`,
    status: 'PASS',
    covers_detector: detector,
    covers_failure_mode: failureMode,
  }));

const skipped = (list, indexes) =>
  list.map((t, i) => (indexes.includes(i) ? { ...t, status: 'SKIP' } : t));

const inv = (id, statement, testId, products = []) => ({ id, statement, test_id: testId, products });
const refusal = (id, condition, testId, products = []) => ({ id, condition, exercised_by_test: testId, products });
const authority = (id, ruleId, source, citation, ambiguous = false) =>
  ({ id, rule_id: ruleId, authority_source: source, citation, ambiguous });
const prov = (id, artifactClass, complete = true, products = []) => ({
  id,
  artifact_class: artifactClass,
  has_source: true,
  has_hash: complete,
  has_timestamp: true,
  has_authority_link: complete,
  products,
});
const reusable = (id, ref, products) => ({ id, control_ref: ref, products });
const gap = (id, description) => ({ id, description, closed_by_pack: null });
const evidence = (id, version, required, populated) =>
  ({ id, version, required_fields: required, populated_fields: populated });

const rules = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);
const checks = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}::check-${i + 1}`);
const finding = (id, description) => ({ id, description });

/* ------------------------------------------------------------ pack script */
/** Each entry describes one pack run: what it covered, what it found, what it left behind. */
const PACKS = [
  {
    pack_id: 'PACK_01', pack_version: '1.0.0', title: 'Rule Ingestion Baseline',
    coverage: { rules: rules('SB942', 12), unsupported: ['SB942-011', 'SB942-012'], sources: ['CA-SB-942'], checks: checks('ingest', 6) },
    discoveries: { new_failure_modes: [finding('fm.unparsed-clause', 'Clause text with nested subsections was silently dropped')] },
    add: {
      detectors: [det('det.clause-parse', 'Clause parse completeness', ['fm.unparsed-clause'], ['deadlinesf'])],
      regression_tests: tests('t.clause-parse', 4, 'det.clause-parse', 'fm.unparsed-clause'),
      evidence_schemas: [evidence('ev.decision', '1.0.0', ['rule_id', 'inputs', 'outcome'], ['rule_id', 'inputs', 'outcome'])],
      blocking_invariants: [inv('inv.no-decision-without-rule', 'No decision may be emitted without a resolved rule id', 't.clause-parse.01', ['deadlinesf'])],
      known_gaps: [gap('gap.temporal-validity', 'No handling of rules that change on an effective date'), gap('gap.authority-boundary', 'Authority of a cited source is not bounded'), gap('gap.replay', 'Evidence is not replay-verified')],
    },
    measurement: { rules_total: 12, rules_evaluated: 12, rules_unsupported: 2, authority_sources_required: 3, authority_sources_used: 1, failure_modes_known: 4, deterministic_checks_total: 6, deterministic_checks_executed: 6 },
  },
  {
    pack_id: 'PACK_02', pack_version: '1.0.0', title: 'Evidence Schema Discipline',
    coverage: { rules: rules('SB942', 12), unsupported: ['SB942-012'], sources: ['CA-SB-942', 'CA-AG-GUIDANCE'], checks: checks('evidence', 9) },
    discoveries: { missing_provenance: [finding('mp.no-source-hash', 'Evidence rows cited a source without pinning its hash')] },
    add: {
      detectors: [det('det.evidence-complete', 'Evidence field completeness', ['fm.thin-evidence'], ['deadlinesf', 'billrosetta'])],
      regression_tests: tests('t.evidence', 5, 'det.evidence-complete', 'fm.thin-evidence'),
      provenance_controls: [prov('prov.source-hash', 'authority source document', true, ['deadlinesf', 'billrosetta'])],
      evidence_schemas: [evidence('ev.citation', '1.0.0', ['source_id', 'source_hash', 'retrieved_at'], ['source_id', 'source_hash', 'retrieved_at'])],
      reusable_controls: [reusable('rc.evidence-complete', 'det.evidence-complete', ['deadlinesf', 'billrosetta'])],
    },
    measurement: { rules_unsupported: 1, authority_sources_used: 2, failure_modes_known: 5, deterministic_checks_total: 9, deterministic_checks_executed: 9 },
  },
  {
    pack_id: 'PACK_03', pack_version: '1.1.0', title: 'Deterministic Replay',
    coverage: { rules: rules('SB942', 12), unsupported: [], sources: ['CA-SB-942', 'CA-AG-GUIDANCE'], checks: checks('replay', 14) },
    discoveries: { new_edge_cases: [finding('ec.map-iteration-order', 'Decision output varied with map iteration order')] },
    add: {
      detectors: [det('det.replay-identity', 'Replay byte-identity', ['fm.nondeterministic-output'], ['deadlinesf', 'billrosetta', 'venturepilotai'])],
      regression_tests: tests('t.replay', 6, 'det.replay-identity', 'fm.nondeterministic-output'),
      blocking_invariants: [inv('inv.replay-identical', 'A replayed run must produce byte-identical evidence', 't.replay.01', ['deadlinesf', 'venturepilotai'])],
      reusable_controls: [reusable('rc.replay-identity', 'det.replay-identity', ['deadlinesf', 'billrosetta', 'venturepilotai'])],
    },
    close_gaps: ['gap.replay'],
    measurement: { rules_unsupported: 0, failure_modes_known: 6, deterministic_checks_total: 14, deterministic_checks_executed: 14, replay_runs: 20, replay_identical: 18 },
  },
  {
    pack_id: 'PACK_04', pack_version: '1.0.0', title: 'Citation Provenance',
    coverage: { rules: rules('SB942', 12), unsupported: [], sources: ['CA-SB-942', 'CA-AG-GUIDANCE', 'FED-REG'], checks: checks('provenance', 18) },
    discoveries: { missing_provenance: [finding('mp.derived-artifact', 'Derived artefacts had no link back to the authority that justified them')] },
    add: {
      detectors: [det('det.citation-resolves', 'Citation resolves to a pinned source', ['fm.dangling-citation'], ['deadlinesf', 'cited'])],
      regression_tests: tests('t.citation', 5, 'det.citation-resolves', 'fm.dangling-citation'),
      provenance_controls: [prov('prov.derived-artifact', 'derived artefact', true, ['deadlinesf', 'cited']), prov('prov.model-output', 'model output', false, ['cited'])],
      authority_mappings: [authority('am.sb942-core', 'SB942-001', 'CA-SB-942', 'SB 942 § 22757.3'), authority('am.ag-guidance', 'SB942-004', 'CA-AG-GUIDANCE', 'AG Guidance 2025-04')],
      reusable_controls: [reusable('rc.citation-resolves', 'det.citation-resolves', ['deadlinesf', 'cited'])],
    },
    measurement: { authority_sources_required: 4, authority_sources_used: 3, failure_modes_known: 7, deterministic_checks_total: 18, deterministic_checks_executed: 18, replay_runs: 34, replay_identical: 32 },
  },
  {
    pack_id: 'PACK_05', pack_version: '1.0.0', title: 'Refusal Conditions',
    coverage: { rules: rules('SB942', 12), unsupported: [], sources: ['CA-SB-942', 'CA-AG-GUIDANCE', 'FED-REG'], checks: checks('refusal', 22) },
    discoveries: { missing_refusal_conditions: [finding('mr.out-of-scope-jurisdiction', 'Engine answered for a jurisdiction it had no pack for')] },
    add: {
      detectors: [det('det.jurisdiction-scope', 'Jurisdiction in scope', ['fm.out-of-scope-answer'], ['deadlinesf', 'billrosetta'])],
      regression_tests: tests('t.refusal', 6, 'det.jurisdiction-scope', 'fm.out-of-scope-answer'),
      refusal_conditions: [
        refusal('rf.out-of-scope', 'Refuse when no pack covers the jurisdiction', 't.refusal.01', ['deadlinesf', 'billrosetta']),
        refusal('rf.stale-authority', 'Refuse when the cited authority is older than its effective window', null, ['deadlinesf']),
      ],
      human_review_triggers: [{ id: 'hr.novel-jurisdiction', trigger: 'First decision in a jurisdiction' }],
      reusable_controls: [reusable('rc.jurisdiction-scope', 'det.jurisdiction-scope', ['deadlinesf', 'billrosetta'])],
    },
    measurement: { failure_modes_known: 8, deterministic_checks_total: 22, deterministic_checks_executed: 22, replay_runs: 48, replay_identical: 46, labeled_cases: 60, true_positives: 39, false_positives: 9, false_negatives: 12 },
  },
  {
    pack_id: 'PACK_06', pack_version: '1.0.0', title: 'Human Review Triggers',
    coverage: { rules: rules('SB942', 12), unsupported: [], sources: ['CA-SB-942', 'CA-AG-GUIDANCE', 'FED-REG', 'CA-CCPA'], checks: checks('review', 26) },
    discoveries: { new_edge_cases: [finding('ec.tie-break', 'Two rules produced conflicting outcomes with no tie-break')] },
    add: {
      detectors: [det('det.rule-conflict', 'Conflicting rule outcomes', ['fm.rule-conflict'], ['deadlinesf', 'billrosetta'])],
      regression_tests: tests('t.conflict', 5, 'det.rule-conflict', 'fm.rule-conflict'),
      human_review_triggers: [
        { id: 'hr.rule-conflict', trigger: 'Two rules disagree on outcome' },
        { id: 'hr.low-confidence-authority', trigger: 'Authority mapping marked ambiguous' },
      ],
      escalation_rules: [{ id: 'esc.conflict-to-human', rule: 'Rule conflict escalates to human review before any BLOCK is issued', products: ['deadlinesf'] }],
      authority_mappings: [authority('am.ccpa-overlap', 'SB942-007', 'CA-CCPA', 'CCPA § 1798.100', true)],
    },
    measurement: { authority_sources_used: 4, failure_modes_known: 9, deterministic_checks_total: 26, deterministic_checks_executed: 26, replay_runs: 61, replay_identical: 59, labeled_cases: 84, true_positives: 58, false_positives: 12, false_negatives: 14 },
  },
  {
    pack_id: 'PACK_07', pack_version: '1.0.0', title: 'Authority Boundary',
    coverage: { rules: rules('AB1008', 16), unsupported: [], sources: ['CA-AB-1008', 'CA-AG-GUIDANCE'], checks: checks('authority', 31) },
    discoveries: { new_failure_modes: [finding('fm.authority-overreach', 'Engine applied a source beyond the scope that source governs')] },
    add: {
      detectors: [det('det.authority-boundary', 'Authority boundary enforcement', ['fm.authority-overreach'], ['deadlinesf'])],
      regression_tests: tests('t.authority-boundary', 4, 'det.authority-boundary', 'fm.authority-overreach'),
      blocking_invariants: [inv('inv.authority-in-scope', 'A rule may only be applied within the scope its authority governs', 't.authority-boundary.01', ['deadlinesf'])],
      authority_mappings: [authority('am.ab1008-core', 'AB1008-001', 'CA-AB-1008', 'AB 1008 § 1798.140')],
      reusable_controls: [reusable('rc.authority-boundary', 'det.authority-boundary', ['deadlinesf'])],
    },
    close_gaps: ['gap.authority-boundary'],
    measurement: { rules_total: 28, rules_evaluated: 28, authority_sources_required: 5, authority_sources_used: 5, failure_modes_known: 10, deterministic_checks_total: 31, deterministic_checks_executed: 31, replay_runs: 80, replay_identical: 78, labeled_cases: 110, true_positives: 79, false_positives: 13, false_negatives: 18 },
  },
  {
    pack_id: 'PACK_08', pack_version: '1.0.0', title: 'Temporal Validity',
    coverage: { rules: rules('AB1008', 16), unsupported: [], sources: ['CA-AB-1008', 'CA-AG-GUIDANCE'], checks: checks('temporal', 37) },
    discoveries: { new_edge_cases: [finding('ec.effective-date-boundary', 'A decision on the effective date itself resolved to the superseded rule')] },
    add: {
      detectors: [det('det.effective-window', 'Effective-date window', ['fm.stale-rule-version'], ['deadlinesf', 'billrosetta', 'goldtrac'])],
      regression_tests: skipped(tests('t.temporal', 7, 'det.effective-window', 'fm.stale-rule-version'), [5, 6]),
      blocking_invariants: [inv('inv.decision-timestamped', 'Every decision pins the rule version effective at its timestamp', 't.temporal.01', ['deadlinesf', 'billrosetta'])],
      evidence_schemas: [evidence('ev.temporal', '1.0.0', ['decided_at', 'rule_version', 'effective_from'], ['decided_at', 'rule_version'])],
      reusable_controls: [reusable('rc.effective-window', 'det.effective-window', ['deadlinesf', 'billrosetta', 'goldtrac'])],
    },
    close_gaps: ['gap.temporal-validity'],
    measurement: { failure_modes_known: 11, deterministic_checks_total: 37, deterministic_checks_executed: 37, replay_runs: 96, replay_identical: 94, labeled_cases: 140, true_positives: 104, false_positives: 15, false_negatives: 21 },
  },
  {
    pack_id: 'PACK_09', pack_version: '1.0.0', title: 'Labelled Corpus & Accuracy',
    coverage: { rules: rules('AB1008', 16), unsupported: [], sources: ['CA-AB-1008', 'CA-AG-GUIDANCE'], checks: checks('accuracy', 41) },
    discoveries: {
      false_positives: [finding('fp.aggressive-scope', 'Scope detector flagged in-scope filings as out of scope')],
      false_negatives: [finding('fn.nested-exemption', 'Nested exemption clause was not detected')],
    },
    add: {
      detectors: [det('det.nested-exemption', 'Nested exemption resolution', ['fm.nested-exemption'], ['deadlinesf', 'billrosetta'])],
      regression_tests: tests('t.exemption', 6, 'det.nested-exemption', 'fm.nested-exemption'),
      reusable_controls: [reusable('rc.nested-exemption', 'det.nested-exemption', ['deadlinesf', 'billrosetta'])],
      known_gaps: [gap('gap.cross-jurisdiction', 'No pack covers filings spanning multiple states')],
    },
    measurement: { failure_modes_known: 12, deterministic_checks_total: 41, deterministic_checks_executed: 41, replay_runs: 118, replay_identical: 116, labeled_cases: 190, true_positives: 151, false_positives: 16, false_negatives: 23 },
  },
  {
    pack_id: 'PACK_10', pack_version: '1.0.0', title: 'Funding Authorization',
    coverage: { rules: rules('FUND', 20), unsupported: [], sources: ['UCC-9', 'CA-FIN-CODE', 'CA-AG-GUIDANCE'], checks: checks('funding', 49) },
    discoveries: { new_failure_modes: [finding('fm.unauthorized-disbursement', 'A disbursement could be issued without a matching authorization record')] },
    add: {
      detectors: [
        det('det.disbursement-authz', 'Disbursement authorization match', ['fm.unauthorized-disbursement'], ['billrosetta-capital', 'billrosetta']),
        det('det.authz-chain', 'Authorization chain integrity', ['fm.broken-authz-chain'], ['billrosetta-capital']),
      ],
      regression_tests: [
        ...tests('t.disbursement', 5, 'det.disbursement-authz', 'fm.unauthorized-disbursement'),
        ...tests('t.authz-chain', 3, 'det.authz-chain', 'fm.broken-authz-chain'),
      ],
      blocking_invariants: [inv('inv.no-unauthorized-funds', 'No disbursement without a verified authorization record', 't.disbursement.01', ['billrosetta-capital'])],
      refusal_conditions: [refusal('rf.missing-authz', 'Refuse any funding action lacking an authorization chain', 't.authz-chain.01', ['billrosetta-capital'])],
      authority_mappings: [authority('am.ucc9', 'FUND-003', 'UCC-9', 'UCC § 9-203'), authority('am.ca-fin', 'FUND-011', 'CA-FIN-CODE', 'Fin. Code § 22100')],
      provenance_controls: [prov('prov.authz-record', 'authorization record', true, ['billrosetta-capital'])],
      escalation_rules: [{ id: 'esc.funding-threshold', rule: 'Disbursement above threshold escalates to human review', products: ['billrosetta-capital'] }],
      reusable_controls: [reusable('rc.disbursement-authz', 'det.disbursement-authz', ['billrosetta-capital', 'billrosetta'])],
      known_gaps: [gap('gap.fx-settlement', 'Cross-currency settlement authority is unmapped')],
    },
    unlocks: [{ product: 'billrosetta-capital', capability: 'Funding Authorization', note: 'Capital flows could not be gated before this pack existed.' }],
    measurement: { rules_total: 48, rules_evaluated: 48, rules_unsupported: 2, authority_sources_required: 8, authority_sources_used: 7, failure_modes_known: 14, deterministic_checks_total: 49, deterministic_checks_executed: 49, replay_runs: 140, replay_identical: 138, labeled_cases: 240, true_positives: 196, false_positives: 20, false_negatives: 24 },
  },
  {
    pack_id: 'PACK_11', pack_version: '1.0.0', title: 'Replay Protection',
    coverage: { rules: rules('FUND', 20), unsupported: [], sources: ['UCC-9', 'CA-FIN-CODE', 'CA-AG-GUIDANCE'], checks: checks('replay-protection', 55) },
    discoveries: { new_failure_modes: [finding('fm.receipt-replay', 'A signed receipt could be resubmitted and re-honoured')] },
    add: {
      detectors: [
        det('det.nonce-freshness', 'Nonce freshness', ['fm.receipt-replay'], ['billrosetta-capital', 'bopcart', 'venturepilotai']),
        det('det.receipt-uniqueness', 'Receipt uniqueness', ['fm.duplicate-receipt'], ['billrosetta-capital', 'bopcart', 'venturepilotai']),
      ],
      regression_tests: [
        ...tests('t.nonce', 3, 'det.nonce-freshness', 'fm.receipt-replay'),
        ...tests('t.uniqueness', 2, 'det.receipt-uniqueness', 'fm.duplicate-receipt'),
      ],
      blocking_invariants: [inv('inv.single-use-receipt', 'A receipt may be honoured at most once', 't.uniqueness.01', ['billrosetta-capital', 'bopcart', 'venturepilotai'])],
      reusable_controls: [reusable('rc.replay-protection', 'det.nonce-freshness', ['billrosetta-capital', 'bopcart', 'venturepilotai'])],
      known_gaps: [gap('gap.key-rotation', 'Receipt signing keys have no rotation or revocation policy')],
    },
    measurement: { failure_modes_known: 16, deterministic_checks_total: 55, deterministic_checks_executed: 55, replay_runs: 168, replay_identical: 166, labeled_cases: 314, true_positives: 259, false_positives: 24, false_negatives: 31 },
  },
  {
    pack_id: 'PACK_12', pack_version: '1.0.0', title: 'Independent Cross-Check',
    coverage: { rules: rules('FUND', 20), unsupported: [], sources: ['UCC-9', 'CA-FIN-CODE'], checks: checks('cross-check', 55) },
    discoveries: {},
    add: {},
    measurement: {},
    note: 'Finds nothing new. The controls survived an independent rule set — that is the signed VALIDATED_NO_CHANGE path.',
  },
];

/* -------------------------------------------------------------------- fold */
const PRODUCTS = [
  ['deadlinesf', 'DeadlineSF', 'LIVE'],
  ['billrosetta', 'BillRosetta', 'LIVE'],
  ['billrosetta-capital', 'BillRosetta Capital', 'VALIDATING'],
  ['venturepilotai', 'VenturePilotAI', 'VALIDATING'],
  ['goldtrac', 'GoldTrac', 'DESIGNED'],
  ['bopcart', 'BopCart', 'UNDECLARED'],
  ['cited', 'Cited', 'UNDECLARED'],
];

function initialState() {
  return {
    data_class: 'ILLUSTRATIVE_EXAMPLE',
    engine_version: '0.1.0',
    state_version: 0,
    updated_at: null,
    commit: null,
    last_pack_id: null,
    controls: {
      detectors: [], regression_tests: [], blocking_invariants: [], evidence_schemas: [],
      refusal_conditions: [], human_review_triggers: [], authority_mappings: [],
      provenance_controls: [], escalation_rules: [], reusable_controls: [], known_gaps: [],
    },
    measurement: {
      rules_total: 0, rules_evaluated: 0, rules_unsupported: 0,
      authority_sources_required: 0, authority_sources_used: 0, failure_modes_known: 0,
      deterministic_checks_total: 0, deterministic_checks_executed: 0,
      replay_runs: 0, replay_identical: 0,
      labeled_cases: 0, true_positives: 0, false_positives: 0, false_negatives: 0,
      bypasses_observed: 0,
    },
    products: PRODUCTS.map(([id, name, status]) => ({
      id, name, status,
      status_source: 'declared for the worked example',
      inherited_controls: [],
      capabilities_unlocked: [],
      scenario_monthly_usd: null,
      scenario_basis: null,
    })),
  };
}

const CONTROL_KEYS = [
  'detectors', 'regression_tests', 'blocking_invariants', 'evidence_schemas',
  'refusal_conditions', 'human_review_triggers', 'authority_mappings',
  'provenance_controls', 'escalation_rules', 'reusable_controls', 'known_gaps',
];

function applyPack(state, pack) {
  const next = structuredClone(state);
  next.state_version += 1;
  next.last_pack_id = pack.pack_id;
  next.updated_at = pack.timestamp;

  for (const key of CONTROL_KEYS) {
    const additions = (pack.add || {})[key] || [];
    next.controls[key] = [
      ...next.controls[key],
      ...additions.map((a) => ({ ...a, added_by_pack: pack.pack_id })),
    ];
  }

  for (const gapId of pack.close_gaps || []) {
    const g = next.controls.known_gaps.find((x) => x.id === gapId);
    if (g) g.closed_by_pack = pack.pack_id;
  }

  // Products inherit the controls that name them.
  for (const key of CONTROL_KEYS) {
    for (const control of (pack.add || {})[key] || []) {
      for (const productId of control.products || []) {
        const p = next.products.find((x) => x.id === productId);
        if (p && !p.inherited_controls.includes(control.id)) p.inherited_controls.push(control.id);
      }
    }
  }

  for (const u of pack.unlocks || []) {
    const p = next.products.find((x) => x.id === u.product);
    if (p) p.capabilities_unlocked.push({ capability: u.capability, unlocked_by_pack: pack.pack_id, note: u.note });
  }

  next.measurement = { ...next.measurement, ...(pack.measurement || {}) };
  return next;
}

function runRecord(pack, i) {
  const day = String(i + 1).padStart(2, '0');
  return {
    pack_id: pack.pack_id,
    pack_version: pack.pack_version,
    run_id: `run-${pack.pack_id.toLowerCase().replace('_', '-')}-${day}`,
    timestamp: `2026-0${i < 9 ? 4 : 5}-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
    starting_commit: `example${String(i).padStart(4, '0')}`,
    ending_commit: `example${String(i + 1).padStart(4, '0')}`,
    title: pack.title,
    rules_evaluated: pack.coverage.rules,
    rules_unsupported: pack.coverage.unsupported,
    authority_sources_used: pack.coverage.sources,
    deterministic_checks_executed: pack.coverage.checks,
    discoveries: pack.discoveries || {},
  };
}

/* -------------------------------------------------------------------- main */
let state = initialState();
let ledger = { ...structuredClone(EMPTY_LEDGER), data_class: 'ILLUSTRATIVE_EXAMPLE' };
const problems = [];

PACKS.forEach((pack, i) => {
  const run = runRecord(pack, i);
  const beforeState = state;
  const afterState = applyPack(state, { ...pack, timestamp: run.timestamp });
  const receipt = buildReceipt({
    run,
    beforeState,
    afterState,
    previousHash: headHash(ledger),
    signingKey: SIGNING_KEY,
  });
  const gate = checkCompleteness(receipt, { signingKey: SIGNING_KEY });
  if (!gate.complete) {
    problems.push(`${pack.pack_id}: ${gate.failures.join('; ')}`);
    return;
  }
  ledger = appendReceipt(ledger, receipt);
  state = afterState;
  process.stdout.write(`  ${renderSummary(receipt)}\n`);
});

if (problems.length > 0) {
  process.stderr.write('\nExample generation produced INCOMPLETE runs:\n');
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}

const verification = verifyLedger(ledger, { signingKey: SIGNING_KEY });
if (!verification.ok) {
  process.stderr.write(`\nLedger failed verification:\n${verification.problems.map((p) => `  ✗ ${p}`).join('\n')}\n`);
  process.exit(1);
}

const finalScore = score(state);
const rows = history(ledger);
const unlocks = [];
for (const r of ledger.receipts) {
  for (const p of r.product_propagation || []) {
    for (const cap of p.unlocked || []) {
      unlocks.push({ pack_id: r.pack_id, capability: cap, product_id: p.product_id, product: p.product });
    }
  }
}

await writeJson(join(HERE, 'example-state.json'), state);
await writeJson(join(HERE, 'example-ledger.json'), ledger);
await writeJson(join(HERE, 'example-widget-data.json'), {
  generated_at: '2026-05-12T12:00:00Z',
  data_class: 'ILLUSTRATIVE_EXAMPLE',
  disclaimer: 'Pack contents are illustrative. Every score, delta, result and signature is computed by the real library and passes the real completeness gate.',
  engine_version: state.engine_version,
  score: finalScore,
  history: rows,
  products: productSurface(state),
  capability_unlocks: unlocks,
  ledger_head: headHash(ledger),
  verification,
  signing: { key_source: 'ENGINE_HARDENING_SIGNING_KEY (example key, not a secret)' },
});

process.stdout.write(`\n  ENGINE STRENGTH ${finalScore.total} / 100 after ${ledger.receipts.length} packs\n`);
for (const c of finalScore.components) {
  process.stdout.write(`    ${c.label.padEnd(22)}${String(c.points).padStart(5)} / ${c.max}\n`);
}
process.stdout.write(`\n  Ledger verified: ${verification.receipts} receipts, head ${verification.head.slice(0, 12)}…\n\n`);
