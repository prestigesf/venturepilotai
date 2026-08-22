/**
 * delta.js — what changed between two engine states.
 *
 * The ENGINE DELTA is computed by set-difference on control ids, not by
 * trusting a pack run's self-report. If a pack claims "+2 detectors" but the
 * after-state contains no new detector objects, the delta is 0 and the run
 * cannot be recorded as IMPROVED.
 */

import { counters, inventory } from './raw.js';
import { score, scoreDelta } from './scoring.js';

const CATEGORIES = [
  ['detectors', 'detectors'],
  ['regressionTests', 'regression_tests'],
  ['invariants', 'blocking_invariants'],
  ['authority', 'authority_mappings'],
  ['evidenceSchemas', 'evidence_schemas'],
  ['refusals', 'refusal_conditions'],
  ['provenance', 'provenance_controls'],
  ['escalation', 'escalation_rules'],
  ['humanReview', 'human_review_triggers'],
  ['reusable', 'reusable_controls'],
];

function idsOf(list) {
  return new Set((list || []).map((x, i) => x.id || `idx:${i}`));
}

function diffCategory(beforeList, afterList) {
  const beforeIds = idsOf(beforeList);
  const afterIds = idsOf(afterList);
  const added = (afterList || []).filter((x, i) => !beforeIds.has(x.id || `idx:${i}`));
  const removed = (beforeList || []).filter((x, i) => !afterIds.has(x.id || `idx:${i}`));
  return {
    added,
    removed,
    added_count: added.length,
    removed_count: removed.length,
    net: added.length - removed.length,
  };
}

/**
 * Structural diff of every control category plus the gap ledger and score.
 */
export function computeDelta(beforeState, afterState) {
  const b = inventory(beforeState);
  const a = inventory(afterState);

  const categories = {};
  for (const [invKey, outKey] of CATEGORIES) {
    categories[outKey] = diffCategory(b[invKey], a[invKey]);
  }

  // Gaps move in the opposite direction: closing one is the win.
  const beforeOpen = new Set(b.openGaps.map((g) => g.id));
  const afterOpen = new Set(a.openGaps.map((g) => g.id));
  const gapsClosed = b.openGaps.filter((g) => !afterOpen.has(g.id));
  const gapsOpened = a.openGaps.filter((g) => !beforeOpen.has(g.id));

  const beforeScore = score(beforeState);
  const afterScore = score(afterState);

  const structuralAdds = Object.values(categories).reduce((s, c) => s + c.added_count, 0);
  const structuralRemovals = Object.values(categories).reduce((s, c) => s + c.removed_count, 0);

  return {
    categories,
    gaps: {
      closed: gapsClosed,
      opened: gapsOpened,
      closed_count: gapsClosed.length,
      opened_count: gapsOpened.length,
      net: gapsOpened.length - gapsClosed.length,
    },
    counters: {
      before: counters(beforeState),
      after: counters(afterState),
    },
    score: scoreDelta(beforeScore, afterScore),
    totals: {
      controls_added: structuralAdds,
      controls_removed: structuralRemovals,
      gaps_closed: gapsClosed.length,
      gaps_opened: gapsOpened.length,
    },
    /** True when the run moved the engine in a way the inventory can prove. */
    is_measurable:
      structuralAdds > 0
      || structuralRemovals > 0
      || gapsClosed.length > 0
      || gapsOpened.length > 0
      || Math.abs(afterScore.total_exact - beforeScore.total_exact) >= 0.05,
    scores: { before: beforeScore, after: afterScore },
  };
}

export { CATEGORIES };
