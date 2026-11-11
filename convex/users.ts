import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireAdmin } from "./lib/auth";
import { parseAdminAllowlist, roleForIdentity } from "./lib/rbac";

/**
 * Called by the client after Clerk sign-in. Creates or refreshes the users
 * row for the authenticated identity. Admin role comes only from the
 * ADMIN_EMAILS allowlist (Convex env var) and a verified email.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const allowlist = parseAdminAllowlist(process.env.ADMIN_EMAILS);
    const allowlistedRole = roleForIdentity(
      identity.email,
      identity.emailVerified,
      allowlist,
    );
    const name =
      identity.name?.trim() ||
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ||
      "A neighbour";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      const role = allowlistedRole === "admin" ? "admin" : existing.role;
      if (
        existing.name !== name ||
        existing.email !== identity.email ||
        existing.role !== role
      ) {
        await ctx.db.patch(existing._id, { name, email: identity.email, role });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email: identity.email,
      role: allowlistedRole,
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile (role drives which nav items show). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(500);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});
