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

## 4 WorkGraph Node (Production — Gaps 1 & 2 Closed)

See also the full production file: [workgraph_node_schema.json](workgraph_node_schema.json)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "node_id": "wg_node_ip_core_alg_0912",
  "asset_name": "Proprietary Core Execution Engine",
  "status": "SECURE_WRAPPED_MERKLE_BATCH",
  
  "gap_1_confidentiality_layer": {
    "kem_standard": "NIST_FIPS_203_ML_KEM_768",
    "hybrid_kex_scheme": "X25519_ML_KEM_768_HYBRID",
    "key_derivation": "HKDF_SHA256_EXTRACT_AND_EXPAND",
    "encapsulated_ciphertext_bytes": 1088,
    "payload_cipher": "AES_256_GCM_AUTHENTICATED"
  },

  "gap_2_merkle_batching_layer": {
    "tree_structure": "RFC_6962_Sparse_Merkle_Tree",
    "hash_primitive": "BLAKE3_256",
    "batch_size_limit": 1024,
    "leaf_index": 412,
    "leaf_hash": "0x4b7c89f2a01391d84f88c8e18b1cf31b9942a12903828751db68bc019283fa01",
    "merkle_inclusion_path": [
      {"dir": "right", "hash": "0x89ab...cd12"},
      {"dir": "left",  "hash": "0x34ef...7890"},
      {"dir": "right", "hash": "0x12bc...45de"}
    ],
    "epoch_merkle_root": "0xfa881c09934e892d13bb912837fec0912389abcd9901328912ef891234567890"
  },

  "cryptographic_attestation": {
    "epoch_id": "epoch_2026_08_16_T1930",
    "epoch_timestamp": "2026-08-16T19:30:00Z",
    "time_beacon_witness": {
      "provider": "NIST_Quantum_Safe_Time_Beacon",
      "beacon_signature": "0x9812bc...ffee"
    },
    "dual_root_signatures": {
      "classical_signature": {
        "algorithm": "ECDSA_P256",
        "sig_value": "0x304502...c419"
      },
      "pqc_signature": {
        "algorithm": "NIST_FIPS_204_ML_DSA_65",
        "signature_size_bytes": 3309,
        "sig_value": "0x9a88f1...88ab"
      }
    }
  }
}
```

## 5 Gap 3 Deterministic Guardrail Module (Additive)

```json
"gap_3_deterministic_guardrail": {
  "engine": "Open_Policy_Agent_WASM",
  "policy_bundle_version": "rego_v2.4.1",
  "evaluation_mode": "PRE_FLIGHT_SYNCHRONOUS",
  "latency_ceiling_ms": 45,
  "untrusted_input_source": "LLM_PARAMETER_EMISSION",
  "ast_validation": {
    "parser": "OPA_AST_V1",
    "invariant_checks": [
      "MAX_TRANSACTION_LIMIT",
      "AUTHORIZED_API_WHITELIST",
      "IMMUTABLE_ROOT_DIRECTORY_LOCK"
    ],
    "evaluation_result": "ALLOW",
    "evaluation_digest": "sha256:5a9e...0021"
  }
}
```

## 6 Gap 4 Enclave Semantic Masking Module (Additive)

```json
"gap_4_enclave_semantic_masking": {
  "tee_provider": "AWS_Nitro_Enclaves",
  "attestation_type": "NITRO_PCR_HARDWARE_ROOTED",
  "memory_encryption": "CHIP_LEVEL_AES_128_XTS",
  "masking_protocol": {
    "nonce_derivation": "HMAC_SHA256_EPHEMERAL",
    "entity_tokenization": "SYNTHETIC_SEMANTIC_MASK",
    "memory_zeroization_policy": "IMMEDIATE_POST_LEAF_GENERATION"
  },
  "host_isolation": {
    "interactive_shell_disabled": true,
    "external_network_restricted": true
  }
}
```

## 7 Gap 5 Attestation Boundaries Module (Additive)

```json
"gap_5_attestation_boundaries": {
  "attestation_model": "EPOCH_BOUND_STATE_ATTESTATION",
  "guarantees": [
    "TEMPORAL_EXISTENCE_BEACON_LINKED",
    "PAYLOAD_TAMPER_EVIDENCE",
    "POLICY_EXECUTION_NON_REPUDIATION"
  ],
  "limitations_and_assumptions": {
    "ground_truth_disclaimer": "ATTESTS_TO_INGESTED_STATE_INTEGRITY_NOT_EXTERNAL_TRUTH",
    "worker_key_ttl_seconds": 900,
    "revocation_mechanism": "SPARSE_MERKLE_REVOCATION_TREE",
    "entropy_anchor": {
      "beacon_source": "NIST_PUBLIC_RANDOMNESS_BEACON",
      "pulse_hash": "0x4e01...bb89"
    }
  }
}
```
