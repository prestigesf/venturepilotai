# 09 Example Schemas (Illustrative)

These are concrete shapes that implement the concepts defined in the earlier documents. They are starting points, not final production schemas.

## 1 Proof Type (Registry Entry)

```json
{
  "proof_type_id": "pt-ip-authorship-v2",
  "name": "IP Authorship Receipt",
  "description": "Attests creation and ownership of a digital work product",
  "cryptographic_primitives": ["ML-DSA-65", "SHA-384"],
  "pqc_status": "pqc-native",
  "continuity_level": 3,
  "receipt_schema_version": "2.1.0",
  "migration_policy": {
    "allowed_targets": ["pt-ip-authorship-v3"],
    "requires_human_approval": false
  },
  "created_at": "2026-08-16T00:00:00Z",
  "last_reviewed_at": "2026-08-16T00:00:00Z",
  "owner": "ip-trust-team"
}
```

## 2 Migration Receipt

```json
{
  "migration_receipt_id": "mr-2026-08-16-0042",
  "original_receipt_id": "rcpt-7f3c2e91-aa01",
  "original_proof_type": "pt-ip-authorship-v1",
  "original_primitives": ["ECDSA-P256", "SHA-256"],
  "new_proof_type": "pt-ip-authorship-v2",
  "new_primitives": ["ML-DSA-65", "SHA-384"],
  "migration_timestamp": "2026-08-16T18:00:00Z",
  "authorizing_authority": "policy:auto-migrate-level1-to-level3",
  "continuity_hash": "sha384:8a3f...",
  "omni_discovery_context_snapshot": {
    "systems_affected": ["ledger-primary", "ip-vault"],
    "threat_window_days_remaining": 0
  },
  "pqc_matrix_row_references": ["row-ecdsa-p256"]
}
```

## 3 PQC Matrix Row

```json
{
  "primitive": "ECDSA-P256",
  "usage_locations": ["legacy-signing-service", "old-receipt-store"],
  "quantum_threat_window": "unknown-or-near",
  "current_status": "migrating",
  "migration_path": "to ML-DSA-65 via policy auto-migrate",
  "continuity_impact": "All Level 0/1 receipts using this primitive require Migration Receipt",
  "omni_discovery_priority": "P1",
  "last_assessed": "2026-08-16T12:00:00Z"
}
```
