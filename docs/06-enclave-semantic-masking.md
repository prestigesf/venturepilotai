# 06 — Confidential Computing Enclaves & Semantic Nonce Masking

## 1. Hardware Trusted Execution Environment (TEE)
- **Runtime Target:** AWS Nitro Enclaves / GCP Confidential Space (AMD SEV-SNP / Intel SGX).
- **Isolation Guarantees:** 
  - Zero external network routing outside authenticated cryptographic proxy sockets.
  - Zero root/interactive shell access.
  - Chip-level memory encryption preventing host hypervisor memory-dump extraction.
- **Hardware Attestation:** Every worker node supplies a cryptographic attestation document signed by the silicon manufacturer root of trust before joining the proof pipeline.

## 2. Semantic Nonce Masking Pipeline
1. **Entity Extraction:** Identifies PII, proprietary weights, and trade-secret structures at the ingestion gateway.
2. **Deterministic Tokenization:** Maps sensitive primitives to salted HMAC tokens:
   $$T_i = \text{HMAC-SHA256}(K_{\text{ephemeral}}, \text{Entity}_i \parallel \text{ContextNonce})$$
3. **Inference Execution:** The untrusted model processes only masked tokens and structural placeholders.
4. **Enclave Detokenization:** Real-world entities are re-anchored exclusively within the isolated enclave memory space when constructing final verifiable proofs.
5. **Memory Zeroization:** Ephemeral mapping keys ($K_{\text{ephemeral}}$) are zeroized from memory immediately upon leaf-hash generation.
