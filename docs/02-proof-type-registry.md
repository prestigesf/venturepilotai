# 02 Proof-Type Registry

## Purpose

The Proof-Type Registry is the authoritative catalog of every proof type that can be issued, verified, and migrated under Proof Continuity Infrastructure.

## 1 Registry Schema

### 1.1 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `proof_type_id` | string (UUID or slug) | Unique identifier |
| `name` | string | Human-readable name |
| `description` | string | What this proof attests |
| `cryptographic_primitives` | array | Current algorithms in use |
| `pqc_status` | enum | `classical` \| `hybrid` \| `pqc-native` \| `migrating` |
| `continuity_level` | 0–3 | See levels below |
| `receipt_schema_version` | semver | Schema of the issued receipt |
| `migration_policy` | object | Rules for how this type may be re-anchored |
| `created_at` | ISO-8601 | |
| `last_reviewed_at` | ISO-8601 | |
| `owner` | string | Team or system responsible |

### 1.2 Continuity Guarantee Levels

- **Level 0** — Classical only. No long-term guarantee. Receipts may become unverifiable after a break.
- **Level 1** — Hybrid (classical + PQC). Partial protection; migration path required.
- **Level 2** — PQC-native with recorded migration path. Continuity is preserved via Migration Receipts.
- **Level 3** — Full multi-decade continuity. Receipt remains valid across any approved algorithm transition because a complete, verifiable Migration Receipt chain always exists.

### 1.3 Relationship to Omni Discovery

Omni Discovery continuously inventories which proof types are in active use, surfaces exposure scores from the PQC matrix, and raises WorkGraph alerts when a type approaches a threat window or requires migration.

### 1.4 Registry Operations

- Register new proof type
- Update primitives / continuity level
- Mark for migration
- Retire (only after all live receipts have been migrated or expired by policy)

All mutations themselves produce an audit receipt under Proof Continuity rules.
