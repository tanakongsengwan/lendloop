import { ConvexError } from "convex/values";

/** User-facing message for a failed Convex call. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}
