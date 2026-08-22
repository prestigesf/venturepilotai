/**
 * propagation.js — which products inherited the hardening this run produced.
 *
 * A product only appears as strengthened when a control added by this run
 * names it. Nothing propagates by association or by being in the same repo.
 */

import { inventory } from './raw.js';

const PROPAGATION_KINDS = [
  'detectors', 'blocking_invariants', 'refusal_conditions',
  'authority_mappings', 'provenance_controls', 'escalation_rules', 'reusable_controls',
];

function productsOf(control) {
  return Array.isArray(control.products) ? control.products : [];
}

/**
 * @param {object} delta result of computeDelta
 * @param {object} afterState engine-state after the run
 * @returns {{by_product:object, unlocked:object[], summary:object[]}}
 */
export function computePropagation(delta, afterState) {
  const registry = Array.isArray(afterState.products) ? afterState.products : [];
  const byProduct = new Map(registry.map((p) => [p.id, {
    id: p.id,
    name: p.name || p.id,
    status: p.status || 'UNKNOWN',
    inherited_this_run: [],
    unlocked_this_run: [],
    total_inherited_controls: Array.isArray(p.inherited_controls) ? p.inherited_controls.length : 0,
  }]));

  for (const kind of PROPAGATION_KINDS) {
    const cat = delta.categories[kind];
    if (!cat) continue;
    for (const control of cat.added) {
      for (const productId of productsOf(control)) {
        const entry = byProduct.get(productId);
        if (!entry) continue; // unregistered product ids are ignored, not invented
        entry.inherited_this_run.push({ kind, id: control.id, name: control.name || control.id });
      }
    }
  }

  // A capability unlock is declared by the pack and must name the capability
  // plus the products that could not previously ship without it.
  const unlocked = [];
  for (const product of registry) {
    for (const cap of Array.isArray(product.capabilities_unlocked) ? product.capabilities_unlocked : []) {
      if (cap.unlocked_by_pack === afterState.last_pack_id) {
        unlocked.push({ product_id: product.id, capability: cap.capability, pack_id: cap.unlocked_by_pack });
        const entry = byProduct.get(product.id);
        if (entry) entry.unlocked_this_run.push(cap.capability);
      }
    }
  }

  const summary = [...byProduct.values()].map((p) => ({
    ...p,
    verdict: p.unlocked_this_run.length > 0
      ? 'UNLOCKED'
      : p.inherited_this_run.length > 0
        ? 'STRENGTHENED'
        : 'NO_CHANGE',
  }));

  return {
    by_product: Object.fromEntries(summary.map((p) => [p.id, p])),
    summary,
    unlocked,
    products_strengthened: summary.filter((p) => p.verdict !== 'NO_CHANGE').length,
  };
}

/** Full inherited-control map for the current state (used by the widget). */
export function productSurface(state) {
  const inv = inventory(state);
  const reusableById = new Map(inv.reusable.map((r) => [r.id, r]));
  return (Array.isArray(state.products) ? state.products : []).map((p) => ({
    id: p.id,
    name: p.name || p.id,
    status: p.status || 'UNKNOWN',
    inherited_controls: (p.inherited_controls || []).map((id) => ({
      id,
      known: reusableById.has(id),
    })),
    capabilities_unlocked: p.capabilities_unlocked || [],
    scenario_monthly_usd: typeof p.scenario_monthly_usd === 'number' ? p.scenario_monthly_usd : null,
    scenario_basis: p.scenario_basis || null,
  }));
}

export { PROPAGATION_KINDS };
