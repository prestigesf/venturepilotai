# VenturePilot: Proof Continuity Infrastructure

**Digital receipts that survive the next cryptographic transition.**

VenturePilot moves from a passive governance layer to **Proof Continuity Infrastructure**.  
The system ensures that the digital receipts of an enterprise’s critical IP, decisions, and compliance records do not “expire” or break when the underlying math shifts.

- **Omni Discovery** — continuous ingestion and context engine  
- **Proof Continuity** — cryptographic bedrock that keeps receipts valid across algorithm changes  

Together they deliver real-time operational awareness with multi-decade data integrity.

---

## Current Status (2026-08-16)

**Gaps 1 & 2 Closed**

- **Gap 1 – Confidentiality**: Hybrid Key Encapsulation **X25519 + ML-KEM-768** (NIST FIPS 203) with HKDF-SHA256 derivation and AES-256-GCM payload encryption. Defeats Harvest-Now-Decrypt-Later.
- **Gap 2 – Signature Bloat**: RFC 6962 Sparse Merkle Tree batching (BLAKE3-256 leaves). Dual ML-DSA-65 + ECDSA signature applied only at epoch root. Per-transaction overhead reduced >90%.

Production schema locked in `docs/workgraph_node_schema.json`.

Ready for **Gaps 3 & 4** (Deterministic OPA/AST Guardrail & Hardware Enclaves).

**Gap 3 Closed (Additive)**

- Deterministic OPA/AST Pre-Flight Policy Engine
- LLM isolated as untrusted parameter emitter outside the deterministic trust boundary
- In-memory WASM (OPA/Rego) evaluation, total pre-flight < 45 ms
- Binary ALLOW/DENY gate; DENY events forensically hashed into Sparse Merkle Tree
- New document: `docs/05-deterministic-guardrail.md`
- Schema module `gap_3_deterministic_guardrail` appended to production WorkGraph node schema

Ready for **Gap 4** (Confidential Computing Enclaves & Semantic Nonce Masking).

**Gap 4 Closed (Additive)**

- Hardware TEE: AWS Nitro Enclaves / GCP Confidential Space (AMD SEV-SNP / Intel SGX)
- Silicon-rooted PCR attestation before any worker joins the pipeline
- Semantic Nonce Masking via ephemeral salted HMAC tokenization
- Immediate memory zeroization of ephemeral mapping keys post leaf-hash generation
- New document: `docs/06-enclave-semantic-masking.md`
- Schema module `gap_4_enclave_semantic_masking` appended to production WorkGraph node schema

Ready for **Gap 5** (Epoch-Bound State Attestation & Operational Boundaries).

**Gap 5 Closed (Additive)**

- Epoch-Bound State Attestation model
- Guarantees: temporal existence (NIST beacon linked), payload tamper evidence, policy execution non-repudiation
- Explicit limitations: attests to ingested state integrity only (not external ground truth); worker key TTL ≤ 15 min; Sparse Merkle Revocation Trees
- New document: `docs/08-operational-boundaries.md`
- Schema module `gap_5_attestation_boundaries` appended to production WorkGraph node schema

**All 5 Architecture Gaps Closed**

---

## Quick Start

```bash
git clone https://github.com/prestigesf/venturepilotai.git
cd venturepilotai
```

### Netlify

Preferred site name: **venturepilotai** (or closest available).

1. Go to https://app.netlify.com
2. Add new site → Import from GitHub
3. Select `prestigesf/venturepilotai`
4. Set site name to `venturepilotai` (or the closest free name Netlify offers)
5. Deploy

`netlify.toml` is already configured for a static site.

Live: https://venturepilotai.netlify.app (or current Netlify domain)

---

## Documents

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Source Extract](docs/01-source-extract.md) | Exact originating conversation text |
| 02 | [Proof-Type Registry](docs/02-proof-type-registry.md) | Registry mechanics, continuity levels, hybrid KEM + dual sig stack |
| 03 | [PQC Exposure Tracking Matrix](docs/03-pqc-exposure-tracking-matrix.md) | Quantum risk + migration tracking |
| 04 | [Migration Receipt](docs/04-migration-receipt-concept.md) | Continuity-preserving re-anchoring + Sparse Merkle batching |
| 05 | [Architecture Outline](docs/05-architecture-outline.md) | System components and core invariant |
| 05 | [Deterministic OPA/AST Guardrail](docs/05-deterministic-guardrail.md) | Gap 3: Pre-flight WASM policy engine & AST validation |
| 06 | [WorkGraph & Alerts](docs/06-workgraph-alerts.md) | Operational awareness surface |
| 06 | [Enclave & Semantic Masking](docs/06-enclave-semantic-masking.md) | Gap 4: TEE isolation + ephemeral HMAC tokenization |
| 07 | [Executive UX](docs/07-executive-ux.md) | How executives and security officers see continuity |
| 08 | [Whitepaper Framing](docs/08-whitepaper-framing.md) | Positioning narrative |
| 08 | [Operational Boundaries](docs/08-operational-boundaries.md) | Gap 5: Epoch-Bound State Attestation & limitations |
| 09 | [Example Schemas](docs/09-example-schemas.md) | Concrete JSON shapes including WorkGraph node |
| 10 | [Continuity Verification](docs/10-continuity-verification.md) | How to verify a receipt is still intact |
| 11 | [Engine Hardening Layer](docs/11-engine-hardening-layer.md) | Additive: PACK IN → DELTA OUT, engine delta receipts and strength scoring |
| — | [Production WorkGraph Node Schema](docs/workgraph_node_schema.json) | Locked Gap 1 through Gap 5 production JSON |

---

## Status

Gaps 1 & 2 closed with production-standard NIST and RFC primitives.  
Gap 3 (Deterministic OPA/AST Guardrail) closed additively.  
Gap 4 (Confidential Computing Enclaves & Semantic Nonce Masking) closed additively.  
Gap 5 (Epoch-Bound State Attestation & Operational Boundaries) closed additively.  
**All 5 Architecture Gaps Closed.**

---

## Engine Hardening Layer (Additive)

A new instrumentation layer beside the existing engine. It does not replace or alter the
engine, the law packs, the tests, or any historical result.

**PACK IN → DELTA OUT.** Every pack run emits an `ENGINE DELTA RECEIPT` answering four
questions: what the pack tested, what it revealed, what permanent hardening the engine
gained, and which products inherited that gain.

One hard rule:

> A pack run is not complete until it produces either a measurable hardening delta or a
> signed `VALIDATED_NO_CHANGE` receipt.

`INCONCLUSIVE` runs exit non-zero and write nothing, so a run can never be quietly filed
as progress. A pack that finds nothing still produces a signed `VALIDATED_NO_CHANGE` —
that means the current controls survived another independent rule set.

- **Engine Strength Score** — 100 points from measurable fields only. Every component
  exposes the raw numbers behind it, each tagged `derived` (counted from the control
  inventory) or `asserted` (reported by the pack run). Unmeasured scores 0, never full
  credit.
- **Hash-chained receipts** — each receipt carries the digest of the previous one, so
  history cannot be rewritten without `engine-delta verify` catching it.
- **Widget** — [`engine-hardening.html`](engine-hardening.html) with four views: Engine
  Strength, Pack History, Capability Unlocks, Economic Surface.
- **Engine strength is evidence; revenue is a scenario.** The widget keeps them apart and
  labels every scenario figure `NOT A FORECAST`.

```bash
node engine-hardening/bin/engine-delta.mjs score     # what is the engine worth, and why
node engine-hardening/bin/engine-delta.mjs run --run pack-11.json --after new-state.json
node engine-hardening/bin/engine-delta.mjs verify    # was the history rewritten?
cd engine-hardening && npm test                      # 43 tests, mostly adversarial
```

The live engine state ships empty and scores 0 — nothing is seeded. See
[`engine-hardening/`](engine-hardening/) for the layer and
[`engine-hardening/examples/`](engine-hardening/examples/) for a worked example whose pack
contents are illustrative but whose every score, delta, result and signature is computed by
the real library and passes the real completeness gate.
