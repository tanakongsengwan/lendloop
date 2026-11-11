import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeSignature,
  signRequest,
  timingSafeEqual,
  verifySignature,
} from "../convex/lib/hmac";

const SECRET = "test-secret-please-change";
const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);
const NONCE = "0123456789abcdef0123456789abcdef";
const BODY = JSON.stringify({ loanId: "abc", status: "sent" });

async function signed(body = BODY, nowMs = NOW, nonce = NONCE) {
  const h = await signRequest(SECRET, body, nowMs, nonce);
  return {
    signature: h["X-LendLoop-Signature"],
    timestamp: h["X-LendLoop-Timestamp"],
    nonce: h["X-LendLoop-Nonce"],
  };
}

describe("computeSignature", () => {
  it("matches Node's HMAC-SHA256 over `${ts}.${nonce}.${body}` (what the n8n Code nodes do)", async () => {
    const ts = "1794387600";
    const expected = createHmac("sha256", SECRET).update(`${ts}.${NONCE}.${BODY}`).digest("hex");
    expect(await computeSignature(SECRET, ts, NONCE, BODY)).toBe(`v1=${expected}`);
  });

  it("refuses to sign without a secret", async () => {
    await expect(computeSignature("", "1", NONCE, BODY)).rejects.toThrow(/secret/);
  });
});

describe("verifySignature", () => {
  it("accepts a correctly signed, fresh request", async () => {
    const res = await verifySignature({ secret: SECRET, rawBody: BODY, nowMs: NOW, ...(await signed()) });
    expect(res).toEqual({ ok: true, nonce: NONCE, timestamp: Math.floor(NOW / 1000) });
  });

  it("rejects a tampered body", async () => {
    const res = await verifySignature({
      secret: SECRET,
      rawBody: BODY.replace("sent", "failed"),
      nowMs: NOW,
      ...(await signed()),
    });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects the wrong secret", async () => {
    const res = await verifySignature({ secret: "other", rawBody: BODY, nowMs: NOW, ...(await signed()) });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature whose nonce was swapped (nonce is signed)", async () => {
    const s = await signed();
    const res = await verifySignature({
      secret: SECRET,
      rawBody: BODY,
      nowMs: NOW,
      ...s,
      nonce: "ffffffffffffffffffffffffffffffff",
    });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects stale and future timestamps outside the window", async () => {
    const sixMinutes = 6 * 60 * 1000;
    const old = await verifySignature({ secret: SECRET, rawBody: BODY, nowMs: NOW + sixMinutes, ...(await signed()) });
    const future = await verifySignature({ secret: SECRET, rawBody: BODY, nowMs: NOW - sixMinutes, ...(await signed()) });
    expect(old).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(future).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("accepts small clock skew inside the window", async () => {
    const res = await verifySignature({ secret: SECRET, rawBody: BODY, nowMs: NOW + 60_000, ...(await signed()) });
    expect(res.ok).toBe(true);
  });

  it("rejects missing or malformed headers", async () => {
    const s = await signed();
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, ...s, signature: null })).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, ...s, timestamp: "12abc" })).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, ...s, nonce: "short" })).toEqual({ ok: false, reason: "bad_nonce" });
  });

  it("signs the empty body used by the overdue fetch", async () => {
    const s = await signed("{}");
    expect((await verifySignature({ secret: SECRET, rawBody: "{}", nowMs: NOW, ...s })).ok).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  it("compares strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("signRequest", () => {
  it("generates a fresh nonce per request", async () => {
    const a = await signRequest(SECRET, BODY);
    const b = await signRequest(SECRET, BODY);
    expect(a["X-LendLoop-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(a["X-LendLoop-Nonce"]).not.toBe(b["X-LendLoop-Nonce"]);
  });
});
