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
| 06 | [WorkGraph & Alerts](docs/06-workgraph-alerts.md) | Operational awareness surface |
| 07 | [Executive UX](docs/07-executive-ux.md) | How executives and security officers see continuity |
| 08 | [Whitepaper Framing](docs/08-whitepaper-framing.md) | Positioning narrative |
| 09 | [Example Schemas](docs/09-example-schemas.md) | Concrete JSON shapes including WorkGraph node |
| 10 | [Continuity Verification](docs/10-continuity-verification.md) | How to verify a receipt is still intact |
| — | [Production WorkGraph Node Schema](docs/workgraph_node_schema.json) | Locked Gap 1 + Gap 2 production JSON |

---

## Status

Gaps 1 & 2 closed with production-standard NIST and RFC primitives.  
Repository is ready for Netlify and for Gaps 3 & 4.
