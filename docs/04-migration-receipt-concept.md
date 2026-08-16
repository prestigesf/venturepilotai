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
