import { describe, expect, it } from "vitest";
import { daysBetween, isIsoDay, rangesOverlap, validateLoanRange } from "../convex/lib/dates";

const NOW = Date.UTC(2026, 10, 11, 12);

describe("dates", () => {
  it("validates ISO days", () => {
    expect(isIsoDay("2026-11-11")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("11/11/2026")).toBe(false);
  });

  it("detects inclusive overlaps", () => {
    expect(rangesOverlap("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-14")).toBe(true);
    expect(rangesOverlap("2026-11-10", "2026-11-12", "2026-11-13", "2026-11-14")).toBe(false);
  });

  it("validates a loan range", () => {
    expect(validateLoanRange("2026-11-11", "2026-11-12", NOW)).toBeNull();
    expect(validateLoanRange("2026-11-10", "2026-11-12", NOW)).toBe("starts_in_past");
    expect(validateLoanRange("2026-11-12", "2026-11-11", NOW)).toBe("end_before_start");
    expect(validateLoanRange("2026-11-11", "2026-12-11", NOW)).toBe("too_long");
    expect(validateLoanRange("nope", "2026-11-11", NOW)).toBe("invalid_date");
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
  });
});
