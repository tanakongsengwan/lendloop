import { ConvexError } from "convex/values";
/**
 * Authorization rules. Every Convex function calls these (through
 * `assert*` helpers) before reading or writing, so the UI hiding a button is
 * never the only line of defence. They take plain objects, so they are
 * trivially unit-testable (no database or ctx access).
 */

export type Role = "admin" | "user";

export type Actor = { _id: string; role: Role };
export type ToolLike = { ownerId: string };
export type LoanLike = {
  lenderId: string;
  borrowerId: string;
  status: LoanStatus;
};

export type LoanStatus =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled"
  | "returned";

export type LoanAction = "approve" | "decline" | "cancel" | "markReturned";

/**
 * ConvexError so the message reaches the client in production builds
 * (plain Errors are redacted to "Server Error").
 */
export class ForbiddenError extends ConvexError<string> {
  constructor(message = "You are not allowed to do that") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const isAdmin = (actor: Actor) => actor.role === "admin";

export const ownsTool = (actor: Actor, tool: ToolLike) =>
  tool.ownerId === actor._id;

/** Only the owner edits a listing. Admins moderate by removing, not editing. */
export const canEditTool = (actor: Actor, tool: ToolLike) =>
  ownsTool(actor, tool);

/** Owners delete their own listing; admins may remove any listing. */
export const canRemoveTool = (actor: Actor, tool: ToolLike) =>
  ownsTool(actor, tool) || isAdmin(actor);

export const canRequestTool = (actor: Actor, tool: ToolLike) =>
  !ownsTool(actor, tool);

export const isLoanParty = (actor: Actor, loan: LoanLike) =>
  loan.lenderId === actor._id || loan.borrowerId === actor._id;

export const canViewLoan = (actor: Actor, loan: LoanLike) =>
  isLoanParty(actor, loan) || isAdmin(actor);

/** Legal state transitions for a loan. */
const TRANSITIONS: Record<LoanAction, { from: LoanStatus[]; to: LoanStatus }> = {
  approve: { from: ["pending"], to: "approved" },
  decline: { from: ["pending"], to: "declined" },
  cancel: { from: ["pending"], to: "cancelled" },
  markReturned: { from: ["approved"], to: "returned" },
};

/** Who may perform an action, independent of the loan's current state. */
export function isAllowedActor(
  actor: Actor,
  loan: LoanLike,
  action: LoanAction,
): boolean {
  switch (action) {
    case "approve":
    case "decline":
      return loan.lenderId === actor._id;
    case "cancel":
      return loan.borrowerId === actor._id;
    case "markReturned":
      // The lender confirms the tool came back. The borrower may also flag it.
      return isLoanParty(actor, loan);
  }
}

export function nextStatus(
  loan: LoanLike,
  action: LoanAction,
): LoanStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(loan.status) ? t.to : null;
}

/** Throws unless `actor` may perform `action` on `loan` right now. */
export function authorizeLoanAction(
  actor: Actor,
  loan: LoanLike,
  action: LoanAction,
): LoanStatus {
  if (!isAllowedActor(actor, loan, action)) {
    throw new ForbiddenError(`Not allowed to ${action} this loan`);
  }
  const to = nextStatus(loan, action);
  if (!to) {
    throw new ConvexError(`Cannot ${action} a loan that is ${loan.status}`);
  }
  return to;
}

export function assertAdmin(actor: Actor): void {
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only");
}

/** Comma-separated allowlist, case-insensitive. */
export function parseAdminAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Admin bootstrap: a user becomes admin only if their *verified* email is on
 * the ADMIN_EMAILS allowlist. Never trust an unverified address for this.
 */
export function roleForIdentity(
  email: string | undefined,
  emailVerified: boolean | undefined,
  allowlist: Set<string>,
): Role {
  if (email && emailVerified && allowlist.has(email.toLowerCase())) {
    return "admin";
  }
  return "user";
}
