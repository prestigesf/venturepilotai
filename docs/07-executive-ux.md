# 07 Executive / Security Officer UX

## Goal (from source)

Design how an executive or security officer visualizes a “Migration Receipt” and interacts with Omni Discovery’s WorkGraph alerts.

## 1 Primary Screens (conceptual)

### Continuity Dashboard
- Overall continuity posture score
- Count of receipts at each continuity level (0–3)
- Open P0 / P1 alerts
- Recent Migration Receipts

### Receipt Detail
- Original receipt
- Full migration chain (if any)
- Current cryptographic regime
- Continuity status badge (Intact / At Risk / Broken)
- One-click “Verify Continuity Chain”

### WorkGraph Explorer
- Interactive graph of systems ↔ proof types ↔ primitives
- Click any node to see exposure and related receipts
- Alert overlays

### Migration Wizard (for authorized operators)
- Select receipts or proof types requiring re-anchoring
- Choose target primitives from approved policy
- Issue Migration Receipt
- Update registry and matrix automatically
