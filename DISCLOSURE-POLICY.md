# Disclosure Policy

## Rule

No internal engine, security, or attestation implementation may be published to a
public site unless it has been explicitly approved for disclosure.

Public products may show customer-safe claims and results only. Implementation
evidence stays private.

## Treated as internal — never published

- `engine-hardening/` — the measurement layer in full
- `engine-hardening.html` — the internal measurement UI
- Engine delta receipts, and the receipt chain
- Law-pack history and capability-unlock history
- Control inventories and test-case inventories
- Engine strength internals and score component breakdowns
- Evidence hashes, baseline digests, and the provenance chain
- Economic-surface internals

## Why the publish scope matters

`netlify.toml` sets `publish = "."`, so **every file in the repository is served
as a public URL**. A file being un-linked from the homepage does not make it
unreachable — the path is still live. Anything committed to a published branch of
a repository with this configuration is public the moment it deploys.

Two controls guard this:

1. Internal material is not present in the published tree on `main`.
2. `netlify.toml` carries forced `404` rules for `/engine-hardening.html`,
   `/engine-hardening/*` and `/docs/*`. Forced rules are evaluated ahead of static
   files, so they hold even if a file is reintroduced by mistake.

## Before publishing anything new

Ask whether the artifact reveals how the system works, or only what it concluded.
Implementation, evidence, hashes, inventories and internal metrics are the former.
A customer-facing result is the latter.
