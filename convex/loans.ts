import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { displayName, requireAdmin, requireUser } from "./lib/auth";
import {
  ForbiddenError,
  authorizeLoanAction,
  canRequestTool,
  canViewLoan,
  type LoanAction,
} from "./lib/rbac";
import { rangesOverlap, todayIso, validateLoanRange } from "./lib/dates";

const RANGE_ERRORS = {
  invalid_date: "Dates must be valid YYYY-MM-DD days",
  end_before_start: "End date must be on or after the start date",
  starts_in_past: "Start date cannot be in the past",
  too_long: "Loans can be at most 30 days",
} as const;

async function findConflict(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  startDate: string,
  endDate: string,
  ignoreLoanId?: Id<"loans">,
) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
  return approved.find(
    (l) =>
      l._id !== ignoreLoanId &&
      rangesOverlap(l.startDate, l.endDate, startDate, endDate),
  );
}

/** Shape returned to the UI. Only the counter-party's display name is exposed. */
async function present(ctx: QueryCtx, loan: Doc<"loans">, viewerId: Id<"users">) {
  const [lender, borrower] = await Promise.all([
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    toolId: loan.toolId,
    toolName: loan.toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    message: loan.message ?? null,
    overdue: loan.status === "approved" && loan.endDate < todayIso(),
    lenderName: displayName(lender),
    lenderTrusted: lender?.trustedLender ?? false,
    borrowerName: displayName(borrower),
    viewerIsLender: loan.lenderId === viewerId,
    viewerIsBorrower: loan.borrowerId === viewerId,
  };
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, startDate, endDate, message }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Listing not found");
    if (!canRequestTool(me, tool)) {
      throw new ForbiddenError("You cannot borrow your own tool");
    }
    const rangeError = validateLoanRange(startDate, endDate);
    if (rangeError) throw new ConvexError(RANGE_ERRORS[rangeError]);

    if (await findConflict(ctx, toolId, startDate, endDate)) {
      throw new ConvexError("The tool is already booked for some of those days");
    }
    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) =>
        q.eq("toolId", toolId).eq("status", "pending"),
      )
      .collect();
    if (myPending.some((l) => l.borrowerId === me._id)) {
      throw new ConvexError("You already have a pending request for this tool");
    }

    const trimmed = message?.trim().slice(0, 300) || undefined;
    const loanId = await ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      lenderId: tool.ownerId,
      borrowerId: me._id,
      startDate,
      endDate,
      status: "pending",
      message: trimmed,
    });

    // Fire the signed n8n webhook after the transaction commits.
    await ctx.scheduler.runAfter(0, internal.automation.notifyRequestCreated, {
      loanId,
      attempt: 1,
    });
    return loanId;
  },
});

function transition(action: LoanAction) {
  return mutation({
    args: { loanId: v.id("loans") },
    handler: async (ctx, { loanId }) => {
      const me = await requireUser(ctx);
      const loan = await ctx.db.get(loanId);
      if (!loan) throw new ConvexError("Request not found");
      const status = authorizeLoanAction(me, loan, action);

      if (action === "approve") {
        if (loan.endDate < todayIso()) {
          throw new ConvexError("This request's dates have already passed");
        }
        const conflict = await findConflict(
          ctx,
          loan.toolId,
          loan.startDate,
          loan.endDate,
          loan._id,
        );
        if (conflict) {
          throw new ConvexError("Another approved loan overlaps these dates");
        }
      }

      await ctx.db.patch(loanId, {
        status,
        ...(action === "markReturned"
          ? { returnedAt: Date.now() }
          : { decidedAt: Date.now() }),
      });
    },
  });
}

export const approve = transition("approve");
export const decline = transition("decline");
export const cancel = transition("cancel");
export const markReturned = transition("markReturned");

/** Requests I made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(200);
    return await Promise.all(loans.map((l) => present(ctx, l, me._id)));
  },
});

/** Requests other people made for my tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", me._id))
      .order("desc")
      .take(200);
    return await Promise.all(loans.map((l) => present(ctx, l, me._id)));
  },
});

/** One loan plus its recent automation activity (parties and admins only). */
export const get = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || !canViewLoan(me, loan)) return null;
    const events = await ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(20);
    return {
      ...(await present(ctx, loan, me._id)),
      automation: events.map((e) => ({
        _id: e._id,
        at: e._creationTime,
        kind: e.kind,
        direction: e.direction,
        status: e.status,
        detail: e.detail,
        attempt: e.attempt ?? null,
      })),
    };
  },
});

/** Admin: every loan in the system. */
export const listAll = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const admin = await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(500);
    const filtered = status ? loans.filter((l) => l.status === status) : loans;
    return await Promise.all(filtered.map((l) => present(ctx, l, admin._id)));
  },
});
