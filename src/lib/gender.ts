/**
 * Canonical gender values for Cricket Academy OS.
 * - 'male': UI label "Boy"
 * - 'female': UI label "Girl"
 */
export type Gender = "male" | "female";

/**
 * Normalizes any historical or UI gender string to a canonical Gender value.
 * Supports: 'girl', 'Girl', 'female', 'Female', 'FEMALE' -> 'female'
 * Supports: 'boy', 'Boy', 'male', 'Male', 'MALE' -> 'male'
 */
export function normalizeGender(gender: string | null | undefined): Gender | null {
  if (!gender) return null;
  const g = gender.toLowerCase().trim();
  if (g === "female" || g === "girl") return "female";
  if (g === "male" || g === "boy") return "male";
  return null;
}

interface ResolvablePlan {
  amount: number | null;
  female_amount: number | null;
}

/**
 * Resolves the monthly fee for a student based on their gender and the session plan.
 * Logic:
 * 1. If gender is female and a female_amount is configured (not null), use it.
 * 2. Otherwise, use the standard amount.
 * 3. Never fall back to boys fee if girls fee is a valid 0.
 */
export function resolveMonthlyFee(plan: ResolvablePlan | null | undefined, gender: string | null | undefined): number {
  if (!plan) return 0;
  
  const normalized = normalizeGender(gender);
  const baseAmount = Number(plan.amount ?? 0);
  
  if (normalized === "female" && plan.female_amount !== null && plan.female_amount !== undefined) {
    return Number(plan.female_amount);
  }
  
  return baseAmount;
}
