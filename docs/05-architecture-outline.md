# 05 Architecture Outline

## Positioning

VenturePilot is no longer a passive governance layer.  
It is **Proof Continuity Infrastructure**.

Digital receipts of critical IP, decisions, and compliance records must survive the next (and subsequent) cryptographic transitions.

## 1 Primary Components

1. **Omni Discovery**  
   Continuous ingestion and context engine. Inventories systems, receipts, primitives, and relationships. Feeds the WorkGraph and the PQC matrix.

2. **Proof Continuity Layer**  
   Cryptographic bedrock. Issues, verifies, and re-anchors receipts. Enforces the continuity invariant via Migration Receipts.

3. **Proof-Type Registry**  
   Catalog of every supported proof type and its continuity guarantee level.

4. **PQC Exposure Tracking Matrix**  
   Live risk and migration status for every cryptographic primitive in use.

5. **Migration Receipt Service**  
   Creates the continuity-preserving re-anchor records.

6. **WorkGraph**  
   Operational awareness surface. Alerts, relationships, and executive visibility.

## 1.1 Core Invariant

> A digital receipt remains valid across algorithm transitions if and only if a complete Migration Receipt chain exists and can be verified against the Proof Continuity layer.

## 1.2 Data Flow (high level)

Omni Discovery → inventory + context  
→ PQC Matrix + Proof-Type Registry  
→ WorkGraph alerts  
→ Migration Receipt issuance when required  
→ updated continuity status visible to executives
