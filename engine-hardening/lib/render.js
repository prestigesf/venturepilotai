/**
 * render.js — the ENGINE DELTA RECEIPT as text, in the layout it was specified.
 */

const PAD = 24;

function line(label, value) {
  return `${label}:${' '.repeat(Math.max(1, PAD - label.length))}${value}`;
}

function bullets(items, empty = 'none') {
  if (!items || items.length === 0) return [`- ${empty}`];
  return items.map((i) => {
    if (typeof i === 'string') return `- ${i}`;
    const label = i.name || i.description || i.statement || i.condition || i.capability || i.id;
    return `- ${label}${i.id && label !== i.id ? ` [${i.id}]` : ''}`;
  });
}

function countBlock(counters) {
  return [
    line('- Active detectors', counters.active_detectors),
    line('- Regression tests', counters.regression_tests),
    line('- Blocking invariants', counters.blocking_invariants),
    line('- Evidence schemas', counters.evidence_schemas),
    line('- Known gaps', counters.known_gaps),
    line('- Human-review triggers', counters.human_review_triggers),
    line('- Reusable controls', counters.reusable_controls),
  ];
}

function signed(n) {
  return `${n > 0 ? '+' : ''}${n}`;
}

/** @param {object} r receipt */
export function renderReceipt(r) {
  const out = [];
  const push = (...xs) => out.push(...xs);

  push('ENGINE DELTA RECEIPT');
  push(line('Engine Version', r.engine_version ?? '—'));
  push(line('Pack ID', r.pack_id ?? '—'));
  push(line('Pack Version', r.pack_version ?? '—'));
  push(line('Run ID', r.run_id ?? '—'));
  push(line('Timestamp', r.timestamp ?? '—'));
  push(line('Starting Commit', r.starting_commit ?? '—'));
  push(line('Ending Commit', r.ending_commit ?? '—'));
  push('');

  const cov = r.pack_coverage || {};
  push('PACK COVERAGE');
  push(line('- Rules evaluated', cov.counts?.rules_evaluated ?? 0));
  push(line('- Rules unsupported', cov.counts?.rules_unsupported ?? 0));
  push(line('- Authority sources used', cov.counts?.authority_sources_used ?? 0));
  push(line('- Deterministic checks', cov.counts?.deterministic_checks_executed ?? 0));
  push('');

  push('BEFORE');
  push(...countBlock(r.before || {}));
  push('');

  const d = r.discoveries || {};
  push('DISCOVERIES');
  push(line('- New failure modes', (d.new_failure_modes || []).length));
  push(line('- New edge cases', (d.new_edge_cases || []).length));
  push(line('- False positives', (d.false_positives || []).length));
  push(line('- False negatives', (d.false_negatives || []).length));
  push(line('- Ambiguous authority', (d.ambiguous_authority_mappings || []).length));
  push(line('- Missing provenance', (d.missing_provenance || []).length));
  push(line('- Missing refusals', (d.missing_refusal_conditions || []).length));
  push('');

  const h = r.hardening_added || {};
  push('HARDENING ADDED');
  push('  Detectors');
  push(...bullets(h.detectors).map((l) => `  ${l}`));
  push('  Regression tests');
  push(...bullets(h.regression_tests).map((l) => `  ${l}`));
  push('  Invariants');
  push(...bullets(h.blocking_invariants).map((l) => `  ${l}`));
  push('  Authority mappings');
  push(...bullets(h.authority_mappings).map((l) => `  ${l}`));
  push('  Evidence fields');
  push(...bullets(h.evidence_fields).map((l) => `  ${l}`));
  push('  Refusal conditions');
  push(...bullets(h.refusal_conditions).map((l) => `  ${l}`));
  push('  Provenance controls');
  push(...bullets(h.provenance_controls).map((l) => `  ${l}`));
  push('  Escalation rules');
  push(...bullets(h.escalation_rules).map((l) => `  ${l}`));
  push('');

  push('AFTER');
  push(...countBlock(r.after || {}));
  push('');

  const e = r.engine_delta || {};
  push('ENGINE DELTA');
  push(line('  detectors', signed(e.detectors ?? 0)));
  push(line('  regressions', signed(e.regression_tests ?? 0)));
  push(line('  invariants', signed(e.blocking_invariants ?? 0)));
  push(line('  authority mappings', signed(e.authority_mappings ?? 0)));
  push(line('  reusable controls', signed(e.reusable_controls ?? 0)));
  push(line('  known gaps', signed(e.known_gaps ?? 0)));
  push('');

  push('PRODUCT PROPAGATION');
  for (const p of r.product_propagation || []) {
    const detail = p.verdict === 'NO_CHANGE'
      ? 'no change'
      : `${p.verdict.toLowerCase()} (${[...p.inherited.map((i) => i.name), ...p.unlocked].join(', ') || '—'})`;
    push(line(`  ${p.product}`, detail));
  }
  if ((r.product_propagation || []).length === 0) push('  - no products registered');
  push('');

  push('STRENGTH');
  const s = r.strength || {};
  for (const c of s.breakdown_after || []) {
    const suffix = c.measured ? '' : '   (unmeasured)';
    push(`  ${c.label.padEnd(PAD - 2)}${String(c.points).padStart(5)} / ${c.max}${suffix}`);
  }
  push(`  ${'TOTAL'.padEnd(PAD - 2)}${String(s.after ?? 0).padStart(5)} / 100`);
  if (s.before !== undefined && s.before !== null) {
    push(`  ${'CHANGE'.padEnd(PAD - 2)}${String(s.before)} → ${String(s.after)}  (${signed(s.change ?? 0)})`);
  }
  push('');

  push('RESULT');
  push(`  ${r.result}`);
  for (const reason of r.result_reasons || []) push(`  · ${reason}`);
  push('');

  const sig = r.signature || {};
  push('ATTESTATION');
  push(line('  Algorithm', sig.algorithm ?? '—'));
  push(line('  Signed', sig.signed ? `yes (key ${sig.key_id})` : 'no — digest only'));
  push(line('  Body digest', (sig.digest || '').slice(0, 32) + '…'));
  push(line('  Previous receipt', (r.previous_receipt_hash || '').slice(0, 32) + '…'));
  push(line('  Receipt hash', (r.receipt_hash || '').slice(0, 32) + '…'));

  return out.join('\n');
}

/** Compact one-line summary used by `history` and CI logs. */
export function renderSummary(r) {
  const e = r.engine_delta || {};
  const parts = [
    `${signed(e.detectors ?? 0)} det`,
    `${signed(e.regression_tests ?? 0)} tests`,
    `${signed(e.blocking_invariants ?? 0)} inv`,
    `${signed(e.known_gaps ?? 0)} gaps`,
  ];
  const s = r.strength || {};
  return `${String(r.pack_id).padEnd(10)} ${String(r.result).padEnd(20)} `
    + `${String(s.before ?? '—').padStart(5)} → ${String(s.after ?? '—').padEnd(5)} `
    + `(${signed(s.change ?? 0)})  ${parts.join('  ')}`;
}
