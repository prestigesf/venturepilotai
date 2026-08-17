# 05 — Deterministic Execution Guardrail & AST Pre-Flight Sandbox

## 1. Trust Boundary Isolation
- **Untrusted Layer:** LLMs, autonomous agents, external API integrations, and natural language prompts.
- **Trusted Boundary:** In-memory WASM Policy Engine, Cryptographic Attestor, and Merkle Batcher.

## 2. Pre-Flight Verification Pipeline
1. **Parameter Emission:** The agent emits a structured JSON intent payload (Action, Target, Args, Nonce).
2. **AST Static Analysis:** The payload is transformed into an Abstract Syntax Tree (AST) to evaluate parameter boundaries, type constraints, and call signatures.
3. **OPA/Rego Invariant Enforcement:** The AST evaluates against compile-time declarative policies compiled into WebAssembly (`.wasm`).
4. **Binary Gate Decision:**
   - `ALLOW`: The action receives a cryptographically signed execution ticket and is dispatched to the execution driver.
   - `DENY`: The action is blocked, logged as a violation event, and hashed into the Sparse Merkle Tree as a forensic failure receipt.

## 3. Performance & Latency SLA
- **AST Parsing:** < 5 ms
- **WASM Policy Evaluation:** < 35 ms
- **Total Pre-Flight Overhead:** < 45 ms
