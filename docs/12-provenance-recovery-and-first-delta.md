# 12 — Provenance Recovery & the First Real Engine Delta

**Additive.** Nothing in the engine was modified. Every action against
`prestigesf/deadlinesf` was read-only.

Date: 2026-08-22

---

## 1. What was recovered

The canonical DeadlineSF Decision API was located in **`prestigesf/deadlinesf`**
(private), verified at `HEAD = 0f9a9530dea2364a98cb5e7774cc2c41a7b0f640`.

It is substantially larger than the July build register described: **33 phases**,
not 10. 100 files in code scope, 8 law packs, 11 engines, 20 test files.

## 2. Verification — reproduced, not believed

The engine ships its own verification procedure. All three checks were run
independently rather than taking any documented figure on trust:

| Check | Command | Result |
|---|---|---|
| Code drift | `phase_diff.py evidence/baseline_code_postPhase33.txt ""` | **0 unexpected drift**, 100/100 files |
| Test suite | `pytest -W error::DeprecationWarning` | **690 passed**, 0 failed, 0 warnings |
| Evidence self-hash | `verify_evidence.py` | **33/33 artifacts re-verify**, 33 baselines, newest describes the tree |

The test count matches the Phase 33 evidence artifact exactly (690), so the
artifacts are accurate as well as internally consistent.

> One dependency note: `requirements.txt` pins `httpx2`, not `httpx`. Installing
> `httpx` instead makes the suite fail at collection under warnings-as-errors,
> because Starlette emits a deprecation warning. Install from
> `requirements.txt`.

## 3. The provenance finding

The July build register states plainly:

> *"Your original build — 291 tests, 15 engines, 10 phases — isn't in this
> container and isn't in any repo I can reach."*

An independent search from this session reached the same conclusion: a
filesystem-wide sweep for `sb942*`, `phase_diff.py`, `hash_chain.py`,
`baseline_code_postPhase*`, `*phase10*` and `phase_*_validation_*.json` returned
zero hits outside the skill documentation and this clone. No connectors are
installed, so there is no path to the operator's local machine.

**Conclusion:** the original 291-test engine is not recoverable from here. What
exists is a rebuild from the skill blueprint, which has since grown from 509
tests (Phase 10, July) to 690 (Phase 33). It is a different lineage and is
labelled as such by its own author.

Separately, the law packs preserved in `prestigesf/eni-vision` under
`eni-valuables/deadlinesf/law-packs/` are a **third**, incompatible lineage:
Python classes carrying legal logic and emitting Cedar text. The canonical
architecture requires law to be *data* (`lawpacks/*.yaml`), an invariant enforced
mechanically by `tests/test_law_is_data.py`, which walks the AST and strips
docstrings and string constants before checking that law identifiers never appear
in executable engine code. The eni-vision packs cannot seed a BEFORE state.

## 4. Capability classification

Per the operator's rule — *no control counts unless it can be pointed to in code,
test, artifact, or signed external receipt* — capabilities are now classified on
evidence rather than on what the specification claims:

| Capability | Before recovery | After verification |
|---|---|---|
| Hash-chained evidence ledger | DOCUMENTED | **TESTED** (`ledger/hash_chain.py`, `tests/test_hash_chain.py`) |
| Law-pack loader, law-as-data | DOCUMENTED | **TESTED** (AST-enforced by `test_law_is_data.py`) |
| Penalty engine | DOCUMENTED | **TESTED** (`penalty/`, `tests/test_penalty.py`) |
| Applicability / deadline | DOCUMENTED | **TESTED** (`engines/applicability.py`, `deadline.py`) |
| Decision engine | DOCUMENTED | **TESTED** (`engines/decision.py`) |
| Stripe execution layer | DOCUMENTED | **TESTED** (`engines/stripe_adapter.py`, `execution.py`) |
| HTTP service + persistence | DOCUMENTED | **TESTED** (`api/`, `persistence/`, `test_api.py`) |
| Phase evidence + drift protocol | DOCUMENTED | **EXECUTED** (33 artifacts re-verified in this session) |
| Original 291-test / 15-engine build | DOCUMENTED | **NOT RECOVERABLE** |

Nothing was promoted because the skill says it should exist.

## 5. The first real engine delta

**Phase 19** is a clean single-pack ingestion: California AB 2013 (Generative AI
Training Data Transparency Act). Pure addition — three files, nothing removed.

```
BEFORE   Phase 18   62 files   547 tests passing   0 warnings   0 drift
PACK     AB 2013 v1.0.0 — Cal. Civ. Code sec. 3110 et seq.
AFTER    Phase 19   65 files   572 tests passing   0 warnings   0 drift

ENGINE DELTA
  authority mappings   +1   (lawpacks/ab2013.yaml)
  detectors             0
  invariants            0
  known gaps            0

PRODUCT PROPAGATION
  DeadlineSF           STRENGTHENED

RESULT   IMPROVED
```

Signed receipt: `engine-hardening/state/deadlinesf-receipt-ab2013.txt`
Ledger: `engine-hardening/state/deadlinesf-ledger.json` (chain verified)

### Strength score — PARTIAL

```
Rule Coverage          10.0 / 20
Detector Coverage       6.0 / 20
Regression Depth        6.0 / 15
Evidence Quality        7.5 / 15
Detection Accuracy      0.0 / 10   unmeasured
Blocking Integrity      5.0 / 10
Provenance              5.0 / 5
Reuse                   2.0 / 5
TOTAL                  41.5 / 100
```

**41.5 is a floor, not a verdict.** It is what the engine can currently *prove*
about itself through this adapter, not what it is worth. Provenance scores full
marks because the hash-chain ledger and self-hashed evidence are real and were
re-verified. Detection accuracy scores zero because no labelled corpus exists to
measure against — unmeasured is 0 by design, never full credit.

## 6. Two honest limitations

1. **The score change was 0, despite +25 tests.** The adapter records one
   regression-test object per test *file*, and AB 2013's 25 new tests landed in
   existing files. A frozen baseline lists files and hashes; it cannot name test
   functions. So a pack that hardens existing files shows no regression delta.
   The instrument under-reports here, and the fix belongs in a later pass rather
   than in a retrofit that would flatter this number.

2. **`lawpacks/ab2013.yaml` was revised after Phase 19.** Its Phase-19 digest is
   `9f76286d…`; the current tree carries `32ef38ed…`. The penalty profile is
   unchanged. Provenance is therefore anchored to the Phase-19 baseline hash, and
   the pack's present contents are not claimed to be what Phase 19 ingested.

Commits are recorded as baseline digests because the build environment had no
git and the protocol records `git_commit=null`. The baseline hash anchors the
state as firmly as a commit would.
