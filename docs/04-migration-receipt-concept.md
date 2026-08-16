# 04 Migration Receipt Concept (UX / Architecture Note)

## Source Reference

From the shared conversation: design how an executive or security officer visualizes a "Migration Receipt".

## 1 Definition

A Migration Receipt is the formal, cryptographically anchored record that a previously issued digital receipt (IP, decision, or compliance record) has been re-anchored under a new cryptographic regime without breaking its continuity claim.

## 1.1 Minimum Contents

- Original receipt identifier
- Original proof type and primitives
- New proof type and primitives
- Migration timestamp
- Authority that authorized the migration
- Continuity hash linking old receipt to new receipt
- Omni Discovery context snapshot at time of migration

## 1.2 Visualization Goal (from source)

An executive or security officer must be able to see, at a glance, that continuity was preserved across the mathematical shift.
