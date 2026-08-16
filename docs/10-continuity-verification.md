# 10 Continuity Verification

## Goal

Any party that holds an original receipt must be able to verify that its continuity claim is still intact.

## 1 Verification Steps

1. Locate the original receipt by ID.
2. Walk the chain of Migration Receipts (if any) that reference it.
3. Confirm each link via the continuity_hash.
4. Confirm the current tip of the chain is signed under a still-approved primitive (per the live PQC matrix and Proof-Type Registry).
5. Return status: **Intact** | **At Risk** | **Broken**.

## 1.1 Broken Conditions

- Missing Migration Receipt where the original primitive is no longer trusted
- Continuity hash mismatch
- Current tip uses a retired or revoked primitive with no further migration

## 1.2 At Risk Conditions

- Current primitive is still accepted but has an elevated threat window and no active migration
- Continuity level is 0 or 1

## 1.3 Implementation Note

The verification function itself should be simple, deterministic, and itself produce an audit receipt when run in production environments.
