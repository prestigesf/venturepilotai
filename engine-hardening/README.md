# Engine Hardening Layer

**PACK IN → DELTA OUT.**

An additive instrumentation layer that sits *beside* the existing engine. It does not
replace or alter the engine, the law packs, the tests, or any historical result. It
reads state, diffs it, scores it, and writes receipts.

Every pack run answers four questions and produces one object:

1. What did this pack test? → `PACK COVERAGE`
2. What new weakness or capability did it reveal? → `DISCOVERIES`
3. What permanent hardening did the engine gain? → `HARDENING ADDED` + `ENGINE DELTA`
4. Which products inherited that gain? → `PRODUCT PROPAGATION`

## The one hard rule

> A pack run is not complete until it produces either a measurable hardening delta
> or a signed `VALIDATED_NO_CHANGE` receipt.

`engine-delta run` exits non-zero and writes nothing when neither holds. There is no
third state in which a run quietly counts as progress.

A run that finds nothing is still worth recording: `VALIDATED_NO_CHANGE` means the
current controls survived another independent rule set. It has to be signed, because
a no-change claim that nobody can attribute is worth nothing.

## Why it cannot be talked into fake progress

- **The delta is diffed, never declared.** `ENGINE DELTA` is computed by set-difference
  on control ids between the before and after state. A pack that claims `+2 detectors`
  but leaves no detector objects behind gets a delta of 0 and cannot be recorded as
  `IMPROVED`.
- **Unmeasured scores 0.** An engine that has never run a labelled case scores 0 on
  detection accuracy. It does not get full marks for having no recorded false positives.
- **Every raw number is labelled `derived` or `asserted`.** Derived numbers are counted
  from the control inventory and cannot be inflated without adding a real control.
  Asserted numbers come from the pack run and are shown as such wherever they are used.
- **Receipts are hash-chained.** Each receipt carries the digest of the previous one, so
  history cannot be rewritten after the fact without `verify` catching it.
- **Regression beats improvement.** A run that adds a detector and breaks a test is
  `REGRESSED`, not `IMPROVED`.

## Layout

```
engine-hardening/
  lib/            the layer (no dependencies)
    raw.js          derive every measurable input, tagged derived|asserted
    scoring.js      the 100-point rubric
    delta.js        before/after inventory diff
    propagation.js  which products inherited what
    receipt.js      assemble + classify the RESULT
    completeness.js the one hard rule
    canonical.js    stable serialisation, hashing, signing
    ledger.js       append-only receipt chain
    render.js       the text receipt layout
  bin/
    engine-delta.mjs    CLI
    inject-example.mjs  inline the example bundle into the widget
  schema/         JSON Schema for state, receipt and pack run
  state/          LIVE engine state + LIVE receipt chain (both start empty)
  examples/       the worked example (illustrative data, real machinery)
  test/           43 tests, mostly adversarial
                    hardening.test.mjs  the library
                    cli.test.mjs        the file I/O path, incl. the promotion guard
../engine-hardening.html   the four-view widget
```

## Usage

```bash
# What is the engine worth right now, and why?
node engine-hardening/bin/engine-delta.mjs score

# Record a pack run. Copy the state, add the controls the pack produced, then:
export ENGINE_HARDENING_SIGNING_KEY="…"
node engine-hardening/bin/engine-delta.mjs run --run pack-11.json --after new-state.json

# Was the history rewritten?
node engine-hardening/bin/engine-delta.mjs verify

# One line per pack
node engine-hardening/bin/engine-delta.mjs history

# Full receipt
node engine-hardening/bin/engine-delta.mjs show PACK_11

# Refresh the widget data
node engine-hardening/bin/engine-delta.mjs export
```

`run` promotes the after-state to `state/engine-state.json` only once the completeness
gate passes.

## Recording a run

The pack run file declares what was *covered* and what was *found*. It never declares
what changed — that is diffed from the state.

```json
{
  "pack_id": "PACK_11",
  "pack_version": "1.0.0",
  "run_id": "run-pack-11-2026-05-11",
  "timestamp": "2026-05-11T12:00:00Z",
  "starting_commit": "abc1234",
  "ending_commit": "def5678",
  "rules_evaluated": ["FUND-001", "…"],
  "rules_unsupported": [],
  "authority_sources_used": ["UCC-9"],
  "deterministic_checks_executed": ["replay::check-1", "…"],
  "discoveries": {
    "new_failure_modes": [{ "id": "fm.receipt-replay", "description": "A signed receipt could be resubmitted" }]
  }
}
```

The hardening itself goes into the after-state as real control objects — a detector with
the failure modes it covers, a regression test naming what it pins, an invariant naming
the test that proves it blocks, a reusable control naming the products consuming it. That
is what makes the delta measurable and the propagation real.

## Scoring

100 points, measurable fields only. Every component exposes its terms, its formula, and
its raw inputs — see `lib/scoring.js`, or click any component in the widget.

| Points | Component | Measures |
|---|---|---|
| 20 | Rule / authority coverage | supported rules, mapped authority sources, unambiguous mappings |
| 20 | Detector coverage | known failure modes with a detector, detectors that are deterministic |
| 15 | Regression depth | failure modes pinned by a test, test density per detector, pass rate |
| 15 | Evidence reproducibility | byte-identical replays, populated required fields, checks executed |
| 10 | False-positive / false-negative | F1 over the labelled corpus |
| 10 | Refusal / blocking integrity | invariants proven to block, refusals exercised, bypasses observed |
| 5 | Provenance completeness | artefact classes with source + hash + timestamp + authority link |
| 5 | Cross-product reuse | controls used by 2+ products, products that inherited a control |

An observed bypass scales blocking integrity down proportionally — a gate that did not
hold is not worth its points.

## Data classes

`state/` is **LIVE** and starts empty. It scores 0 because nothing has been measured yet.
That is the correct reading, and nothing is seeded to make it look better.

`examples/` is **ILLUSTRATIVE_EXAMPLE**. The pack contents are invented; everything
derived from them — every score, delta, result, signature and chain link — is produced by
this library and passes this gate. Regenerate with:

```bash
cd engine-hardening && npm run build:example
```

## Tests

```bash
cd engine-hardening && npm test
```

Most of them assert what the layer refuses to do.
