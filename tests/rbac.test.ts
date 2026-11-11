import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  assertAdmin,
  authorizeLoanAction,
  canEditTool,
  canRemoveTool,
  canRequestTool,
  canViewLoan,
  parseAdminAllowlist,
  roleForIdentity,
  type Actor,
  type LoanLike,
  type LoanStatus,
} from "../convex/lib/rbac";

const owner: Actor = { _id: "u_owner", role: "user" };
const borrower: Actor = { _id: "u_borrower", role: "user" };
const stranger: Actor = { _id: "u_stranger", role: "user" };
const admin: Actor = { _id: "u_admin", role: "admin" };

const tool = { ownerId: owner._id };
const loan = (status: LoanStatus): LoanLike => ({
  lenderId: owner._id,
  borrowerId: borrower._id,
  status,
});

describe("listing permissions", () => {
  it("only the owner can edit", () => {
    expect(canEditTool(owner, tool)).toBe(true);
    expect(canEditTool(stranger, tool)).toBe(false);
    expect(canEditTool(admin, tool)).toBe(false);
  });

  it("owner or admin can remove", () => {
    expect(canRemoveTool(owner, tool)).toBe(true);
    expect(canRemoveTool(admin, tool)).toBe(true);
    expect(canRemoveTool(stranger, tool)).toBe(false);
  });

  it("nobody can borrow their own tool", () => {
    expect(canRequestTool(owner, tool)).toBe(false);
    expect(canRequestTool(borrower, tool)).toBe(true);
  });
});

describe("loan visibility", () => {
  it("parties and admins can view, others cannot", () => {
    expect(canViewLoan(owner, loan("pending"))).toBe(true);
    expect(canViewLoan(borrower, loan("pending"))).toBe(true);
    expect(canViewLoan(admin, loan("pending"))).toBe(true);
    expect(canViewLoan(stranger, loan("pending"))).toBe(false);
  });
});

describe("authorizeLoanAction", () => {
  it("lender approves or declines a pending request", () => {
    expect(authorizeLoanAction(owner, loan("pending"), "approve")).toBe("approved");
    expect(authorizeLoanAction(owner, loan("pending"), "decline")).toBe("declined");
  });

  it("borrower cannot approve their own request", () => {
    expect(() => authorizeLoanAction(borrower, loan("pending"), "approve")).toThrow(ForbiddenError);
  });

  it("admins do not act on other people's loans", () => {
    expect(() => authorizeLoanAction(admin, loan("pending"), "approve")).toThrow(ForbiddenError);
    expect(() => authorizeLoanAction(admin, loan("approved"), "markReturned")).toThrow(ForbiddenError);
  });

  it("strangers can do nothing", () => {
    for (const action of ["approve", "decline", "cancel", "markReturned"] as const) {
      expect(() => authorizeLoanAction(stranger, loan("pending"), action)).toThrow(ForbiddenError);
    }
  });

  it("only the borrower cancels, and only while pending", () => {
    expect(authorizeLoanAction(borrower, loan("pending"), "cancel")).toBe("cancelled");
    expect(() => authorizeLoanAction(owner, loan("pending"), "cancel")).toThrow(ForbiddenError);
    expect(() => authorizeLoanAction(borrower, loan("approved"), "cancel")).toThrow(/approved/);
  });

  it("either party can mark an approved loan returned", () => {
    expect(authorizeLoanAction(owner, loan("approved"), "markReturned")).toBe("returned");
    expect(authorizeLoanAction(borrower, loan("approved"), "markReturned")).toBe("returned");
  });

  it("rejects illegal state transitions", () => {
    expect(() => authorizeLoanAction(owner, loan("declined"), "approve")).toThrow(/declined/);
    expect(() => authorizeLoanAction(owner, loan("approved"), "approve")).toThrow(/approved/);
    expect(() => authorizeLoanAction(owner, loan("pending"), "markReturned")).toThrow(/pending/);
    expect(() => authorizeLoanAction(owner, loan("returned"), "markReturned")).toThrow(/returned/);
  });
});

describe("admin bootstrap", () => {
  const allow = parseAdminAllowlist(" Admin@Example.com, ops@example.com ,,");

  it("parses a comma-separated, case-insensitive allowlist", () => {
    expect([...allow]).toEqual(["admin@example.com", "ops@example.com"]);
    expect(parseAdminAllowlist(undefined).size).toBe(0);
  });

  it("promotes only verified allowlisted emails", () => {
    expect(roleForIdentity("ADMIN@example.com", true, allow)).toBe("admin");
    expect(roleForIdentity("admin@example.com", false, allow)).toBe("user");
    expect(roleForIdentity("admin@example.com", undefined, allow)).toBe("user");
    expect(roleForIdentity("someone@example.com", true, allow)).toBe("user");
    expect(roleForIdentity(undefined, true, allow)).toBe("user");
  });

  it("assertAdmin guards admin-only functions", () => {
    expect(() => assertAdmin(admin)).not.toThrow();
    expect(() => assertAdmin(owner)).toThrow(ForbiddenError);
  });
});
