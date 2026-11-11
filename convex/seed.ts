import { internalMutation } from "./_generated/server";
import { todayIso } from "./lib/dates";

/**
 * Demo data for local development: `npx convex run seed:demo`.
 * Internal, so it cannot be called from a browser. Creates two placeholder
 * users (not linked to Clerk), a few tools and one overdue loan so the n8n
 * overdue workflow has something to do.
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("tools").first();
    if (existing) return "Already seeded";

    const day = (offset: number) => todayIso(Date.now() + offset * 86_400_000);
    const ana = await ctx.db.insert("users", {
      tokenIdentifier: "seed|ana",
      name: "Ana (demo)",
      email: "ana@example.com",
      role: "user",
      trustedLender: true,
    });
    const ben = await ctx.db.insert("users", {
      tokenIdentifier: "seed|ben",
      name: "Ben (demo)",
      email: "ben@example.com",
      role: "user",
      trustedLender: false,
    });

    const drill = await ctx.db.insert("tools", {
      ownerId: ana,
      name: "Cordless drill",
      category: "Power tools",
      condition: "Good",
      description: "18V, two batteries and a bit set.",
    });
    await ctx.db.insert("tools", {
      ownerId: ana,
      name: "Extension ladder",
      category: "Ladders & access",
      condition: "Like new",
      description: "3.5 m aluminium ladder.",
    });
    await ctx.db.insert("tools", {
      ownerId: ben,
      name: "Hedge trimmer",
      category: "Garden",
      condition: "Fair",
      description: "",
    });
    await ctx.db.insert("loans", {
      toolId: drill,
      toolName: "Cordless drill",
      lenderId: ana,
      borrowerId: ben,
      startDate: day(-5),
      endDate: day(-2),
      status: "approved",
      decidedAt: Date.now(),
    });
    return "Seeded 2 users, 3 tools, 1 overdue loan";
  },
});
