import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./lib/hmac";

const MAX_BODY_BYTES = 64 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

class BadRequest extends Error {}

/**
 * Wraps an n8n -> Convex endpoint: verifies the HMAC signature, timestamp
 * window and single-use nonce before the handler sees the parsed body.
 * Failures return a generic 401 so callers learn nothing about which check
 * failed; the precise reason is logged server-side.
 */
function signedEndpoint(
  name: string,
  handler: (ctx: ActionCtx, body: Record<string, unknown>) => Promise<Response>,
) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_CONVEX_SECRET;
    if (!secret) {
      console.error(`[${name}] N8N_TO_CONVEX_SECRET is not set`);
      return json(503, { error: "not_configured" });
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

    const verdict = await verifySignature({
      secret,
      rawBody,
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      nonce: request.headers.get(NONCE_HEADER),
    });
    if (!verdict.ok) {
      console.warn(`[${name}] rejected: ${verdict.reason}`);
      return json(401, { error: "unauthorized" });
    }
    const fresh = await ctx.runMutation(internal.automation.consumeNonce, {
      nonce: verdict.nonce,
    });
    if (!fresh) {
      console.warn(`[${name}] rejected: replayed nonce`);
      return json(401, { error: "unauthorized" });
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = rawBody ? JSON.parse(rawBody) : {};
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error();
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "invalid_json" });
    }

    try {
      return await handler(ctx, body);
    } catch (err) {
      if (err instanceof BadRequest) return json(400, { error: err.message });
      console.error(`[${name}] failed`, err);
      return json(500, { error: "internal_error" });
    }
  });
}

function str(body: Record<string, unknown>, key: string, optional = false) {
  const value = body[key];
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 500) {
    throw new BadRequest(`invalid_${key}`);
  }
  return value;
}

async function normalizeLoanId(ctx: ActionCtx, raw: string | undefined) {
  if (!raw) return undefined;
  const id = await ctx.runQuery(internal.httpHelpers.normalizeLoanId, { id: raw });
  if (!id) throw new BadRequest("invalid_loanId");
  return id as Id<"loans">;
}

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json(200, { ok: true })),
});

/** Daily overdue workflow, step 1: fetch overdue loans (signed POST, empty JSON body). */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signedEndpoint("overdue-loans", async (ctx) => {
    const data = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json(200, data);
  }),
});

/** Daily overdue workflow, step 2: idempotent write-back per reminder. */
http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedEndpoint("reminder-status", async (ctx, body) => {
    const loanId = await normalizeLoanId(ctx, str(body, "loanId"));
    const status = str(body, "status");
    if (status !== "sent" && status !== "failed") throw new BadRequest("invalid_status");
    const result = await ctx.runMutation(internal.automation.recordReminderResult, {
      loanId: loanId!,
      idempotencyKey: str(body, "idempotencyKey")!,
      status,
      detail: str(body, "detail", true),
    });
    return json(result.duplicate ? 200 : 201, result);
  }),
});

/** n8n error workflow: report a failed execution. */
http.route({
  path: "/n8n/workflow-error",
  method: "POST",
  handler: signedEndpoint("workflow-error", async (ctx, body) => {
    const result = await ctx.runMutation(internal.automation.recordWorkflowError, {
      idempotencyKey: str(body, "idempotencyKey")!,
      workflow: str(body, "workflow")!,
      node: str(body, "node", true),
      message: str(body, "message")!,
      loanId: await normalizeLoanId(ctx, str(body, "loanId", true)),
    });
    return json(result.duplicate ? 200 : 201, result);
  }),
});

export default http;
