/**
 * canonical.js — stable serialisation, hashing and signing.
 *
 * Receipts are hash-chained the same way the WorkGraph leaves are: each receipt
 * carries the digest of the previous one, so a receipt cannot be back-dated or
 * quietly rewritten once the next run has been recorded.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Deterministic JSON: object keys sorted, arrays left in order. */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

export function sha256(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : canonicalize(input)).digest('hex');
}

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Sign a receipt body. With ENGINE_HARDENING_SIGNING_KEY set this is a real
 * HMAC; without it the receipt is digest-only and says so. An unsigned receipt
 * is still tamper-evident within the chain, but it is not attributable, and
 * the completeness gate treats VALIDATED_NO_CHANGE differently for the two.
 */
export function signBody(body, key = process.env.ENGINE_HARDENING_SIGNING_KEY) {
  const payload = canonicalize(body);
  const digest = sha256(payload);
  if (!key) {
    return { algorithm: 'SHA-256', signed: false, digest, signature: null, key_id: null };
  }
  return {
    algorithm: 'HMAC-SHA-256',
    signed: true,
    digest,
    signature: createHmac('sha256', key).update(payload).digest('hex'),
    key_id: sha256(`key-id:${key}`).slice(0, 16),
  };
}

export function verifyBody(body, signature, key = process.env.ENGINE_HARDENING_SIGNING_KEY) {
  const payload = canonicalize(body);
  const digest = sha256(payload);
  if (!signature) return { ok: false, reason: 'no signature block on receipt' };
  if (signature.digest !== digest) return { ok: false, reason: 'digest mismatch — receipt body was modified' };
  if (!signature.signed) return { ok: true, reason: 'digest verified (receipt is unsigned)', signed: false };
  if (!key) return { ok: false, reason: 'receipt is signed but no ENGINE_HARDENING_SIGNING_KEY available to verify' };
  const expected = createHmac('sha256', key).update(payload).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature.signature || '', 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true, reason: 'signature verified', signed: true };
}
