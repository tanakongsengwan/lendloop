import { ConvexError } from "convex/values";
import { CATEGORIES, CONDITIONS, LIMITS } from "./categories";

export type ToolInput = {
  name: string;
  category: string;
  condition: string;
  description: string;
};

/** Trims and validates listing input; throws a user-readable error. */
export function cleanToolInput(input: ToolInput): ToolInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > LIMITS.name) {
    throw new ConvexError(`Name must be 2-${LIMITS.name} characters`);
  }
  if (description.length > LIMITS.description) {
    throw new ConvexError(`Description must be at most ${LIMITS.description} characters`);
  }
  if (!(CATEGORIES as readonly string[]).includes(input.category)) {
    throw new ConvexError("Unknown category");
  }
  if (!(CONDITIONS as readonly string[]).includes(input.condition)) {
    throw new ConvexError("Unknown condition");
  }
  return { name, category: input.category, condition: input.condition, description };
}
