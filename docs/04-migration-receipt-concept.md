# 04 Migration Receipt

## Definition

A **Migration Receipt** is the formal, cryptographically anchored record that a previously issued digital receipt (IP, decision, compliance record, or other proof) has been re-anchored under a new cryptographic regime **without breaking its continuity claim**.

## 1 Minimum Required Contents

- `migration_receipt_id`
- `original_receipt_id`
- `original_proof_type` + primitives
- `new_proof_type` + primitives
- `migration_timestamp`
- `authorizing_authority` (human or policy)
- `continuity_hash` (links old receipt → new receipt)
- `omni_discovery_context_snapshot` (what the system knew at migration time)
- `pqc_matrix_row_references`
- `signature` / attestation under the new regime

## 1.1 Continuity Invariant

A digital receipt remains valid across algorithm transitions **if and only if** a complete, verifiable chain of Migration Receipts exists and can be checked against the Proof Continuity layer.

## 1.2 Visualization Goal

An executive or security officer must be able to open any original receipt and immediately see:

1. Its current continuity status
2. The full migration chain (if any)
3. That no silent break occurred when the math changed

## 2 Sparse Merkle Batching Layer (Gap 2 Resolved)

ML-DSA-65 signatures are ~3,309 bytes each. Signing every micro-event, API call, or telemetry packet individually saturates bandwidth and causes exponential database growth.

### Technical Fix — RFC 6962 Sparse Merkle Tree

- **Leaf Level**: Individual micro-events are hashed to 32-byte BLAKE3 (or SHA-256) digests.
- **Root Aggregation**: N events (N = 1024 or 1-minute epochs) form a binary Merkle tree producing a single 32-byte `Root_epoch`.
- **Dual Root Attestation**: One ML-DSA-65 + ECDSA dual signature is applied exclusively to the epoch root.
- **Verification Overhead**: Any single transaction needs only:
  - 32-byte payload hash
  - ~320-byte Merkle inclusion path
  - The single shared root signature

This reduces per-transaction signature overhead by >90% while preserving full cryptographic integrity and auditability.

### Production Status

- Tree structure: RFC 6962 Sparse Merkle Tree
- Hash primitive: BLAKE3-256
- Batch size limit: 1024 leaves (or epoch-based)
- Dual attestation: ML-DSA-65 + ECDSA_P256 signed at root only
- Verification: Self-contained inclusion proof + optional NIST Quantum-Safe Time Beacon timestamp

**Status**: Gaps 1 & 2 closed with production-standard NIST and RFC primitives.
