/** Match normalized RAAS activity rows to students by username or display name. */
import type { RaaSActivity } from "@/lib/types";

/** Normalize a name/username for fuzzy comparison. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\.(clar|xml|txt|docx|pdf|json|zip)$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Tokens of a name, for last-name / first-name partial matching. */
function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter(Boolean);
}

/**
 * Find the best RAAS activity row for a student name.
 * Tries: exact username/displayName match → full normalized equality →
 * token-subset (all student tokens present in a row) → single-token overlap.
 */
export function matchActivity(studentName: string, rows: RaaSActivity[]): RaaSActivity | null {
  if (rows.length === 0) return null;
  const sNorm = norm(studentName);
  const sTokens = tokens(studentName);

  // Exact on username or displayName.
  const exact = rows.find((r) => (r.username && norm(r.username) === sNorm) || (r.displayName && norm(r.displayName) === sNorm) || r.matchedKey === sNorm);
  if (exact) return exact;

  // All student tokens contained in the row's name tokens (handles "Jane Doe" vs "Doe, Jane").
  const subset = rows.find((r) => {
    const rTokens = new Set([...tokens(r.username || ""), ...tokens(r.displayName || "")]);
    return sTokens.length > 0 && sTokens.every((t) => rTokens.has(t));
  });
  if (subset) return subset;

  // Last-resort: any shared token of length >= 3.
  const overlap = rows.find((r) => {
    const rTokens = new Set([...tokens(r.username || ""), ...tokens(r.displayName || "")]);
    return sTokens.some((t) => t.length >= 3 && rTokens.has(t));
  });
  return overlap ?? null;
}
