import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Validates an untrusted string as a loans id (null if it is not one). */
export const normalizeLoanId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => ctx.db.normalizeId("loans", id),
});
