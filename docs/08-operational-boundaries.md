# 08 — Epoch-Bound State Attestation & Operational Limitations

## 1. Scope of Attestation
VenturePilot receipts are **Epoch-Bound State Attestations**. They mathematically guarantee:
- **Tamper Evidence:** Payload $P$ has not mutated since epoch timestamp $T$.
- **Non-Repudiation:** Identity/Key $K$ authored execution intent $I$ within an authenticated enclave.
- **Policy Compliance:** Action evaluated to `ALLOW` under verified policy set $R_{epoch}$.
- **Temporal Anchor:** State existed prior to NIST Randomness Beacon pulse $B_{T}$.

## 2. Explicit Operational Assumptions & Limitations
1. **No Ground Truth Certification:** The attestation proves the *integrity of ingested data at timestamp $T$*, not the objective truth of real-world claims. Ingesting falsified data results in a certified record of that falsification.
2. **Untrusted External Environment:** Host operating systems and network perimeter nodes are presumed hostile; trust roots strictly in hardware enclaves (AWS Nitro PCRs) and quantum-safe root certificates.
3. **Key Lifecycle & Revocation:** Worker node signing keys possess an ephemeral time-to-live ($\text{TTL} \le 15\text{ min}$). Root revocations propagate via Sparse Merkle Revocation Trees evaluated at epoch boundaries.
