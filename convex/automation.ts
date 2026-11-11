import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { automationKind } from "./schema";
import { displayName } from "./lib/auth";
import { signRequest, DEFAULT_TOLERANCE_SECONDS } from "./lib/hmac";
import { daysBetween, todayIso } from "./lib/dates";

/** Backoff for the outbound request webhook: attempt -> delay before next try. */
export const RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const WEBHOOK_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Outbound: Convex -> n8n "request created" webhook
// ---------------------------------------------------------------------------

/**
 * Builds the minimal payload n8n needs to email the lender. The borrower's
 * email is deliberately NOT included; only their display name.
 */
export const requestPayload = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const [lender, borrower] = await Promise.all([
      ctx.db.get(loan.lenderId),
      ctx.db.get(loan.borrowerId),
    ]);
    return {
      status: loan.status,
      payload: {
        event: "loan_request.created",
        /** Stable id: n8n uses it to drop duplicate deliveries of a retry. */
        eventId: `request-created:${loan._id}`,
        loanId: loan._id,
        toolName: loan.toolName,
        startDate: loan.startDate,
        endDate: loan.endDate,
        message: loan.message ?? null,
        borrowerName: displayName(borrower),
        lender: { name: displayName(lender), email: lender?.email ?? null },
        reviewUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/app/incoming`,
      },
    };
  },
});

export const notifyRequestCreated = internalAction({
  args: { loanId: v.id("loans"), attempt: v.number() },
  handler: async (ctx, { loanId, attempt }) => {
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    const log = (status: "success" | "retrying" | "failed", detail: string) =>
      ctx.runMutation(internal.automation.recordEvent, {
        loanId,
        kind: "request_notification",
        direction: "outbound",
        status,
        detail,
        attempt,
      });

    if (!url || !secret) {
      await log("failed", "n8n webhook is not configured (N8N_REQUEST_WEBHOOK_URL / CONVEX_TO_N8N_SECRET)");
      return;
    }
    const data = await ctx.runQuery(internal.automation.requestPayload, { loanId });
    if (!data) return; // loan deleted meanwhile
    if (data.status !== "pending") {
      await log("success", `Skipped: request is already ${data.status}`);
      return;
    }

    const body = JSON.stringify(data.payload);
    let failure: string;
    try {
      const headers = await signRequest(secret, body);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": data.payload.eventId,
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (res.ok) {
        await log("success", `n8n accepted the notification (HTTP ${res.status})`);
        return;
      }
      failure = `n8n responded HTTP ${res.status}`;
      // 4xx other than 408/429 will not get better by retrying.
      if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) {
        await log("failed", `${failure}; not retrying`);
        return;
      }
    } catch (err) {
      failure = `Delivery error: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (attempt < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      await log("retrying", `${failure}; retrying in ${Math.round(delay / 1000)}s`);
      await ctx.scheduler.runAfter(delay, internal.automation.notifyRequestCreated, {
        loanId,
        attempt: attempt + 1,
      });
    } else {
      await log("failed", `${failure}; gave up after ${attempt} attempts`);
    }
  },
});

export const recordEvent = internalMutation({
  args: {
    loanId: v.optional(v.id("loans")),
    kind: automationKind,
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    status: v.union(v.literal("success"), v.literal("retrying"), v.literal("failed")),
    detail: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("automationEvents", args);
  },
});

// ---------------------------------------------------------------------------
// Inbound: n8n -> Convex (signed HTTP endpoints in convex/http.ts)
// ---------------------------------------------------------------------------

/**
 * Records a nonce as used. Returns false if it was already seen, which means
 * the request is a replay. Runs as a mutation, so concurrent replays are
 * serialised by Convex's transactional guarantees.
 */
export const consumeNonce = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const seen = await ctx.db
      .query("webhookNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (seen) return false;
    await ctx.db.insert("webhookNonces", {
      nonce,
      // Keep a little longer than the timestamp window on either side.
      expiresAt: Date.now() + 2 * DEFAULT_TOLERANCE_SECONDS * 1000,
    });
    return true;
  },
});

export const pruneNonces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("webhookNonces")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(1000);
    for (const n of expired) await ctx.db.delete(n._id);
    return expired.length;
  },
});

export function reminderKey(loanId: string, day: string) {
  return `overdue-reminder:${loanId}:${day}`;
}

/**
 * Overdue loans for n8n. Returns only what is needed to send a reminder.
 * Loans already reminded today are skipped, so re-running the workflow is
 * harmless.
 */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayIso();
    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(200);
    const result = [];
    for (const loan of overdue) {
      if (loan.lastReminderDate === today) continue;
      const borrower = await ctx.db.get(loan.borrowerId);
      if (!borrower?.email) continue;
      result.push({
        loanId: loan._id,
        idempotencyKey: reminderKey(loan._id, today),
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        borrower: { name: displayName(borrower), email: borrower.email },
      });
    }
    return { date: today, loans: result };
  },
});

/**
 * Idempotent write-back from the overdue workflow. The idempotency key is
 * unique per loan per day; a repeated call returns the original outcome
 * without writing anything.
 */
export const recordReminderResult = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, idempotencyKey, status, detail }) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) {
      return { duplicate: true, eventId: existing._id };
    }
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Loan not found");
    if (!idempotencyKey.startsWith(`overdue-reminder:${loanId}:`)) {
      throw new ConvexError("Idempotency key does not match loan");
    }
    const eventId = await ctx.db.insert("automationEvents", {
      loanId,
      kind: "overdue_reminder",
      direction: "inbound",
      status: status === "sent" ? "success" : "failed",
      detail:
        status === "sent"
          ? "Overdue reminder emailed to borrower"
          : `Overdue reminder failed: ${(detail ?? "unknown error").slice(0, 300)}`,
      idempotencyKey,
    });
    if (status === "sent") {
      await ctx.db.patch(loanId, { lastReminderDate: idempotencyKey.split(":").pop() });
    }
    return { duplicate: false, eventId };
  },
});

/** n8n error workflow reports a failed execution here (idempotent per execution). */
export const recordWorkflowError = internalMutation({
  args: {
    idempotencyKey: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
    loanId: v.optional(v.id("loans")),
  },
  handler: async (ctx, { idempotencyKey, workflow, node, message, loanId }) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) return { duplicate: true, eventId: existing._id };
    const eventId = await ctx.db.insert("automationEvents", {
      loanId,
      kind: "workflow_error",
      direction: "inbound",
      status: "failed",
      detail: `n8n "${workflow}" failed${node ? ` at "${node}"` : ""}: ${message.slice(0, 300)}`,
      idempotencyKey,
    });
    return { duplicate: false, eventId };
  },
});
