/**
 * Canonical-JSON sha8 dedupe key.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/op-checkpoint.ts:311-320 (MIT).
 *
 * Take [gsig-078]: a dependency-free stable-fingerprint recipe —
 * sha256(canonicalJson(params)) truncated to 8 hex chars, where canonicalJson
 * recursively stringifies with SORTED object keys "so a reorder of object
 * literals doesn't flip the fingerprint." Serves the signal contract's
 * `dedupe_key` (signal.schema.json): a stable key so duplicate signals merge
 * while both timestamps survive.
 *
 * Deviations from the original:
 *   - Renamed `fingerprint` -> `dedupeKey` for the vc-brain caller. Logic and
 *     the sha8 truncation are verbatim.
 *   - Uses `node:crypto` (the runtime-neutral specifier; gbrain imports bare
 *     `crypto`). This is the one unavoidable non-pure dependency for this take —
 *     it is a node/bun builtin, not a third-party package. Every other function
 *     here is pure.
 */

import { createHash } from 'node:crypto';

/**
 * Stable sha8 over the canonical-JSON of `params`. Same input => same hash
 * across runs and across hosts. Keys are sorted so a reorder of object literals
 * doesn't flip the key.
 */
export function dedupeKey(params: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(params)).digest('hex').slice(0, 8);
}

/**
 * Deterministic JSON serialization: recursively stringify with sorted object
 * keys. Arrays keep order (order is meaningful); object key order is normalized.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
