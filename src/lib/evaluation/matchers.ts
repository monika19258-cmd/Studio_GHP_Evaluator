/**
 * ──────────────────────────────────────────────────────────────────────────
 *  PRECISION MATCHING ENGINE  (ported 1:1 from clar_batch_evaluator.html)
 *  Based on exact Workday Studio XML tags. These are the default matchers
 *  reused by both the built-in evaluators and the data-driven criteria.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Count exact tag/pattern occurrences (case-insensitive). */
export function count(text: string, pattern: string): number {
  try {
    return (text.match(new RegExp(pattern, "gi")) || []).length;
  } catch {
    return 0;
  }
}

/** Check if any pattern exists and return the first evidence snippet (or null). */
export function findFirst(text: string, patterns: string[]): string | null {
  for (const p of patterns) {
    try {
      const re = new RegExp(p, "i");
      const m = text.match(re);
      if (m) {
        const idx = text.toLowerCase().indexOf(m[0].toLowerCase());
        const snip = text
          .substring(Math.max(0, idx - 10), idx + m[0].length + 50)
          .replace(/\s+/g, " ")
          .trim();
        return snip.length > 90 ? snip.substring(0, 90) + "…" : snip;
      }
    } catch {
      /* invalid regex — skip */
    }
  }
  return null;
}

/** True if any of the patterns match. */
export function has(text: string, patterns: string[]): boolean {
  return findFirst(text, patterns) !== null;
}

/** HTML-escape a string for safe rendering. */
export function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
