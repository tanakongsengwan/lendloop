import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ForbiddenError, assertAdmin } from "./rbac";

type Ctx = QueryCtx | MutationCtx;

/** Current user row, resolved from the Clerk JWT that Convex validated. */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ForbiddenError("Sign in first");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  assertAdmin(user);
  return user;
}

/** Name shown to other signed-in users. Never falls back to the email. */
export function displayName(user: Doc<"users"> | null | undefined): string {
  return user?.name?.trim() || "A neighbour";
}
