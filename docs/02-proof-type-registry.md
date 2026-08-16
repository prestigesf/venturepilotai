# 02 Proof-Type Registry (Technical Spec — Additive Draft)

## Purpose

Define the exact mechanics of the Proof-Type Registry as referenced in the source conversation.

## 1 Registry Role

The Proof-Type Registry is the catalog of proof types that can be issued, verified, and migrated under the Proof Continuity Infrastructure.

## 1.1 Core Fields (initial set)

- proof_type_id
- name
- description
- cryptographic_primitives (current)
- pqc_migration_status
- receipt_schema_version
- continuity_guarantee_level
- created_at
- last_reviewed_at

## 1.2 Continuity Guarantee Levels

- Level 0: Classical only (no long-term guarantee)
- Level 1: Hybrid classical + PQC
- Level 2: PQC-native with migration path recorded
- Level 3: Full multi-decade continuity (receipt remains valid across algorithm transitions)

## 1.3 Relationship to Omni Discovery

Omni Discovery continuously ingests context and surfaces which proof types are in use and which are approaching cryptographic exposure.
