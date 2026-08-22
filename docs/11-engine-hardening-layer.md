# 11 — Engine Hardening Layer

**Additive.** This layer sits beside the existing engine. It does not replace or alter the
engine, the law packs, the tests, or any historical result. It reads state, diffs it,
scores it, and writes receipts.

Implementation: [`engine-hardening/`](../engine-hardening/) · Widget: [`engine-hardening.html`](../engine-hardening.html)

---

## The problem it solves

Before this layer, a pack run ended in a judgement: *I ran another pack and it felt
stronger.* There was no object that recorded what the pack tested, what it revealed, what
the engine permanently gained, or which products inherited that gain — so there was no way
to answer the only question that matters after twenty packs: **what did each pack actually
buy me?**

The layer replaces the judgement with a receipt.

```
PACK IN → DELTA OUT
```

## The core object

Every pack run emits one `ENGINE DELTA RECEIPT`:

```
ENGINE DELTA RECEIPT
Engine Version / Pack ID / Pack Version / Run ID / Timestamp
Starting Commit / Ending Commit / Previous Receipt Hash

PACK COVERAGE      rules evaluated · rules unsupported · authority sources · deterministic checks
BEFORE             detectors · regressions · invariants · evidence schemas · gaps · review triggers · reusable controls
DISCOVERIES        new failure modes · edge cases · false positives · false negatives ·
                   ambiguous authority · missing provenance · missing refusals
HARDENING ADDED    detectors · regression tests · invariants · authority mappings ·
                   evidence fields · refusal conditions · provenance controls · escalation rules
AFTER              (same counters as BEFORE)
ENGINE DELTA       + detectors · + regressions · + invariants · + authority mappings ·
                   + reusable controls · − known gaps
PRODUCT PROPAGATION  per product: UNLOCKED | STRENGTHENED | NO_CHANGE
STRENGTH           component breakdown, before → after
RESULT             IMPROVED | VALIDATED_NO_CHANGE | REGRESSED | INCONCLUSIVE
ATTESTATION        algorithm · signature · body digest · previous receipt · receipt hash
```

Schema: [`engine-hardening/schema/engine-delta-receipt.schema.json`](../engine-hardening/schema/engine-delta-receipt.schema.json)

## The one hard rule

> A pack run is not complete until it produces either a measurable hardening delta or a
> signed `VALIDATED_NO_CHANGE` receipt.

No fake improvement. If Pack 12 finds nothing new, that is still valuable — it means the
current controls survived another independent rule set — but the claim has to be signed to
be worth anything.

`INCONCLUSIVE` is never complete. The CLI exits non-zero and writes nothing, so a run
cannot be quietly filed as progress.

### What makes a delta "measurable"

`ENGINE DELTA` is computed by set-difference on control ids between the before-state and
the after-state. It is never read from what the pack claims. A pack that reports
`+2 detectors` while leaving no detector objects behind produces a delta of 0 and fails
the gate if it is labelled `IMPROVED`.

### Result classification

| Result | Condition |
|---|---|
| `REGRESSED` | a failing regression test, an observed bypass, a removed control, or a falling score — checked first, so adding a detector never masks breaking a test |
| `IMPROVED` | a measurable delta: controls added or gaps closed |
| `VALIDATED_NO_CHANGE` | no delta, no unaddressed discoveries, and evidence the existing controls were actually exercised — plus a signature |
| `INCONCLUSIVE` | the pack did not really run, or it recorded findings and hardened nothing |

Recording a **new known gap is discovery, not regression**. The engine did not get weaker;
it got more honest about what it does not cover.

## Engine Strength Score

100 points, from measurable fields only. Every component exposes the raw numbers behind
it, so the headline is never the whole claim.

```
Rule Coverage          18.2 / 20
Detector Coverage      17.4 / 20
Regression Depth       13.5 / 15
Evidence Quality       14.4 / 15
Detection Accuracy      9.0 / 10
Blocking Integrity      8.3 / 10
Provenance              3.8 / 5
Reuse                   4.7 / 5
TOTAL                  89.2 / 100
```

*(figures from the worked example — illustrative pack contents, real arithmetic)*

Each raw input is tagged:

- **derived** — counted from the control inventory. Cannot be inflated without adding a
  real control object.
- **asserted** — reported by the pack run. Shown as such everywhere it is used.

Two rules keep the score honest:

1. **Unmeasured is 0, never full credit.** An engine that has never run a labelled case
   scores 0 on detection accuracy — it does not earn ten points for having no recorded
   false positives.
2. **Ratios are clamped.** An over-reported numerator cannot buy more than a component is
   worth.

## Widget

Four views over the same receipt chain:

| View | Answers |
|---|---|
| **Engine Strength** | current score, before/after, and every raw number behind each component |
| **Pack History** | one row per pack with a delta bar, expandable to the full receipt |
| **Capability Unlocks** | what each pack made newly possible, and which products it reached |
| **Economic Surface** | which monetizable products depend on those capabilities |

The Capability Unlocks view is the one that answers the original question:

```
PACK_07                      PACK_10                      PACK_11
+ Authority Boundary         + Funding Authorization      + Replay Protection
+ 4 tests                    + 8 tests                    + 5 tests
       ↓                            ↓                            ↓
Strengthened:                Unlocked:                    Strengthened:
DeadlineSF                   BillRosetta Capital          BillRosetta Capital
                                                          VenturePilotAI
                                                          BopCart
```

## Engine strength and money are never added together

The widget separates them deliberately:

- **Engine strength is evidence.** It is derived from controls that exist and measurements
  that were taken.
- **Scenario revenue is a scenario.** It is an assumption someone wrote down. Every
  scenario figure requires a stated `scenario_basis`, and the panel is labelled
  `NOT A FORECAST`.

Product status (`LIVE`, `VALIDATING`, `DESIGNED`) is declared by the operator and is never
measured by this layer. What the layer does measure is which products inherited which
controls.

## Preservation

This layer is purely additive:

- No existing document, schema, test or result was modified.
- The live engine state ships empty and scores 0 — nothing is seeded to flatter it.
- The worked example is labelled `ILLUSTRATIVE_EXAMPLE` everywhere it appears, including
  in the widget's header badge.
