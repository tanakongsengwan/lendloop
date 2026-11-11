import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { displayName, requireUser } from "./lib/auth";
import { ForbiddenError, canEditTool, canRemoveTool } from "./lib/rbac";
import { cleanToolInput } from "./lib/validation";
import { todayIso } from "./lib/dates";

const toolFields = {
  name: v.string(),
  category: v.string(),
  condition: v.string(),
  description: v.string(),
};

/**
 * Public, unauthenticated catalogue. Data minimisation: returns ONLY name and
 * category. No ids, owners, descriptions or availability leave the backend.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").take(100);
    return tools.map(({ name, category }) => ({ name, category }));
  },
});

async function availabilityFor(ctx: QueryCtx, toolId: Id<"tools">) {
  const today = todayIso();
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
  const current = approved.find((l) => l.startDate <= today);
  const upcoming = approved
    .filter((l) => l.startDate > today)
    .map((l) => ({ startDate: l.startDate, endDate: l.endDate }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    available: !current,
    onLoanUntil: current?.endDate ?? null,
    upcoming,
  };
}

/** Signed-in catalogue with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .order("desc")
          .take(200)
      : await ctx.db.query("tools").order("desc").take(200);

    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          ownerName: displayName(owner),
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: tool.ownerId === me._id,
          ...(await availabilityFor(ctx, tool._id)),
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(
      tools.map(async (tool) => {
        const pending = await ctx.db
          .query("loans")
          .withIndex("by_tool_status", (q) =>
            q.eq("toolId", tool._id).eq("status", "pending"),
          )
          .collect();
        return {
          ...tool,
          pendingRequests: pending.length,
          ...(await availabilityFor(ctx, tool._id)),
        };
      }),
    );
  },
});

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      ...cleanToolInput(args),
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Listing not found");
    if (!canEditTool(me, tool)) throw new ForbiddenError("Not your listing");
    const clean = cleanToolInput(fields);
    await ctx.db.patch(toolId, clean);
    // Keep the name snapshot on open loans in sync.
    for (const status of ["pending", "approved"] as const) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool_status", (q) =>
          q.eq("toolId", toolId).eq("status", status),
        )
        .collect();
      for (const loan of loans) await ctx.db.patch(loan._id, { toolName: clean.name });
    }
  },
});

/**
 * Owners delete their own listing; admins can remove any listing.
 * Owners cannot delete a tool that is currently lent out. Pending requests
 * are cancelled so borrowers are not left waiting.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Listing not found");
    if (!canRemoveTool(me, tool)) throw new ForbiddenError("Not your listing");

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) =>
        q.eq("toolId", toolId).eq("status", "approved"),
      )
      .collect();
    if (approved.length > 0 && me.role !== "admin") {
      throw new ConvexError("This tool has an approved loan. Mark it returned first.");
    }
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) =>
        q.eq("toolId", toolId).eq("status", "pending"),
      )
      .collect();
    for (const loan of [...pending, ...approved]) {
      await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: Date.now() });
    }
    await ctx.db.delete(toolId);
  },
});
