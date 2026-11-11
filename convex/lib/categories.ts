export const CATEGORIES = [
  "Power tools",
  "Hand tools",
  "Garden",
  "Ladders & access",
  "Cleaning",
  "Camping & outdoor",
  "Kitchen",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["New", "Like new", "Good", "Fair", "Worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LIMITS = {
  name: 80,
  description: 500,
} as const;
