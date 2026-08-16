# 03 PQC Exposure Tracking Matrix

## Purpose

Live view of every cryptographic primitive in use across the enterprise, its quantum exposure, and the status of its migration path under Proof Continuity.

## 1 Matrix Columns

| Column | Description |
|--------|-------------|
| Primitive / Algorithm | e.g. RSA-2048, ECDSA-P256, ML-KEM-768, SLH-DSA |
| Usage Locations | Systems, receipt types, data classes that depend on it |
| Quantum Threat Window | Estimated years until practical break (or “unknown”) |
| Current Status | classical / hybrid / pqc-native / migrating / retired |
| Migration Path | Reference to approved target primitives + policy |
| Continuity Impact | What happens to existing receipts if this primitive breaks |
| Omni Discovery Priority | Alert priority (P0–P3) |
| Last Assessed | Timestamp |

## 1.1 Continuity Rule

Any change that affects an already-issued receipt **must** produce a Migration Receipt.  
The original receipt never silently expires; continuity is explicitly re-anchored.

## 1.2 Integration Points

- Omni Discovery feeds live usage inventory into the matrix.
- Proof-Type Registry reads continuity level and migration status from the matrix.
- WorkGraph surfaces high-priority rows as alerts to executives and security officers.
