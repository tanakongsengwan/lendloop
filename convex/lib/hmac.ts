/**
 * HMAC-SHA256 request signing shared by every Convex <-> n8n hop.
 *
 * Wire format (both directions):
 *   X-LendLoop-Timestamp: unix seconds when the request was signed
 *   X-LendLoop-Nonce:     random, single-use value (replay protection)
 *   X-LendLoop-Signature: "v1=" + hex(HMAC_SHA256(secret, `${timestamp}.${nonce}.${rawBody}`))
 *
 * The receiver rejects a request when the signature does not match, when the
 * timestamp is outside the tolerance window, or when the nonce was already
 * seen inside that window. Uses Web Crypto only, so the same module runs in
 * the Convex runtime, in Node (tests) and is mirrored in the n8n Code nodes.
 */

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const NONCE_HEADER = "x-lendloop-nonce";
export const SIGNATURE_VERSION = "v1";

/** Requests older/newer than this are rejected (seconds). */
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function signingPayload(
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return `${timestamp}.${nonce}.${rawBody}`;
}

export async function computeSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): Promise<string> {
  if (!secret) throw new Error("HMAC secret is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingPayload(timestamp, nonce, rawBody)),
  );
  return `${SIGNATURE_VERSION}=${toHex(mac)}`;
}

/** Constant-time string comparison (length is not secret here). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export type SignedHeaders = {
  "X-LendLoop-Timestamp": string;
  "X-LendLoop-Nonce": string;
  "X-LendLoop-Signature": string;
};

export async function signRequest(
  secret: string,
  rawBody: string,
  nowMs: number = Date.now(),
  nonce: string = generateNonce(),
): Promise<SignedHeaders> {
  const timestamp = Math.floor(nowMs / 1000).toString();
  return {
    "X-LendLoop-Timestamp": timestamp,
    "X-LendLoop-Nonce": nonce,
    "X-LendLoop-Signature": await computeSignature(
      secret,
      timestamp,
      nonce,
      rawBody,
    ),
  };
}

export type VerifyInput = {
  secret: string;
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  nonce: string | null | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
};

export type VerifyResult =
  | { ok: true; nonce: string; timestamp: number }
  | {
      ok: false;
      reason:
        | "missing_headers"
        | "bad_timestamp"
        | "stale_timestamp"
        | "bad_nonce"
        | "bad_signature";
    };

/**
 * Stateless part of verification: headers present, timestamp fresh,
 * signature valid. The caller must additionally check that `nonce` has not
 * been used before (see `consumeNonce` in convex/automation.ts).
 */
export async function verifySignature(input: VerifyInput): Promise<VerifyResult> {
  const {
    secret,
    rawBody,
    signature,
    timestamp,
    nonce,
    nowMs = Date.now(),
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = input;

  if (!signature || !timestamp || !nonce) {
    return { ok: false, reason: "missing_headers" };
  }
  if (!/^\d{1,12}$/.test(timestamp)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    return { ok: false, reason: "bad_nonce" };
  }
  const ts = Number(timestamp);
  if (Math.abs(nowMs / 1000 - ts) > toleranceSeconds) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = await computeSignature(secret, timestamp, nonce, rawBody);
  if (!timingSafeEqual(expected, signature.trim())) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, nonce, timestamp: ts };
}
