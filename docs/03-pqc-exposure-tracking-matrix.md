# 03 PQC Exposure Tracking Matrix (Technical Spec — Additive Draft)

## Purpose

Define the PQC (Post-Quantum Cryptography) exposure tracking matrix referenced in the source conversation.

## 1 Matrix Dimensions

- Algorithm / Primitive
- Current usage locations (systems, receipt types, data classes)
- Quantum threat timeline estimate
- Migration path status
- Proof Continuity impact if broken
- Omni Discovery alert priority

## 1.1 Initial Rows (placeholder structure only)

| Primitive | Usage | Threat Window | Migration Status | Continuity Impact | Alert Priority |
|-----------|-------|---------------|------------------|-------------------|----------------|
| (to be populated from live inventory) | | | | | |

## 1.2 Link to Proof Continuity

Any change in the matrix that affects an issued receipt must produce a Migration Receipt that is itself recorded under Proof Continuity rules so the original digital receipt does not silently expire.
