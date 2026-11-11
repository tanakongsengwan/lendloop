import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("admin"), v.literal("user"));

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const automationKind = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
  v.literal("workflow_error"),
);

export default defineSchema({
  users: defineTable({
    /** Clerk identity, from ctx.auth (issuer + subject). */
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role,
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    /** Snapshot so history survives the listing being removed. */
    toolName: v.string(),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    /** Inclusive calendar days, "YYYY-MM-DD". */
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    message: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    lastReminderDate: v.optional(v.string()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_lender", ["lenderId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),

  /** Audit trail of every automation hop, shown on each loan. */
  automationEvents: defineTable({
    loanId: v.optional(v.id("loans")),
    kind: automationKind,
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    status: v.union(
      v.literal("success"),
      v.literal("retrying"),
      v.literal("failed"),
    ),
    detail: v.string(),
    attempt: v.optional(v.number()),
    /** Set for write-backs from n8n; unique per logical operation. */
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_loan", ["loanId"])
    .index("by_idempotency_key", ["idempotencyKey"]),

  /** Nonces seen on signed inbound requests, kept until they expire. */
  webhookNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expiry", ["expiresAt"]),
});
