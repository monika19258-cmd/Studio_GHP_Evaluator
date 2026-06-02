/**
 * ──────────────────────────────────────────────────────────────────────────
 *  RULE-DOCUMENT PARSER
 *
 *  Parses one or more reference rule documents (already extracted to plain text
 *  by the file readers) into a structured, EDITABLE rubric. The grader reviews
 *  and adjusts the result in the UI before running.
 *
 *  Strategy (heuristic, deterministic, no LLM):
 *   1. Split the text into candidate rubric lines (numbered lists, bullets,
 *      markdown table rows, "… — N mark(s)/points/pts" lines).
 *   2. For each line, extract a label and a weight.
 *   3. If the label clearly maps to one of the ported built-in criteria
 *      (keyword match), reuse that built-in evaluator as the default matcher
 *      (preserving the original regex logic) but adopt the doc's weight.
 *   4. Otherwise emit a data-driven criterion, seeding regex checks from any
 *      Workday Studio tokens (cc:*, wd:*, application=, etc.) found on the line.
 *
 *  The grader can edit everything afterwards, and can add/remove checks.
 * ──────────────────────────────────────────────────────────────────────────
 */
import type { Criterion, DataCheck, Rubric } from "@/lib/types";
import { DEFAULT_CRITERIA } from "@/lib/evaluation/default-rubric";

/** Keyword → built-in criterion id, used to reuse ported evaluators for known rules. */
const BUILTIN_KEYWORDS: { id: string; keywords: RegExp }[] = [
  { id: "arrangement", keywords: /\b(arrangement|assembly structure|overall arrangement)\b/i },
  { id: "swimlanes", keywords: /\bswim ?lanes?\b/i },
  { id: "error_handler", keywords: /\bglobal error handler\b/i },
  { id: "send_error", keywords: /\b(local error handler|send-?error)\b/i },
  { id: "naming_integration", keywords: /\b(naming).*(integration)|integration.*(naming)\b/i },
  { id: "core_logic", keywords: /\bcore logic(al)?\b/i },
  { id: "naming_components", keywords: /\b(component|studio).*(nam)|naming.*(component|studio)\b/i },
  { id: "no_logs", keywords: /\b(no logs|not having logs|cc:log|raw log)\b/i },
  { id: "cloud_log", keywords: /\bcloud-?log\b/i },
  { id: "isu", keywords: /\bISU\b|integration system user/i },
];

const ISSG_KEYWORD = /\bISSG\b|integration system security group/i;

/** Extract a numeric weight from a rubric line (e.g. "1.5 marks", "(0.25)", "— 1 mark"). */
function extractWeight(line: string): number | null {
  // "<n> mark(s)/point(s)/pt(s)"
  const m1 = line.match(/(\d+(?:\.\d+)?)\s*(?:marks?|points?|pts?)\b/i);
  if (m1) return parseFloat(m1[1]);
  // "(<n>)" or "[<n>]" at line end
  const m2 = line.match(/[([]\s*(\d+(?:\.\d+)?)\s*[)\]]\s*$/);
  if (m2) return parseFloat(m2[1]);
  // markdown table cell "| 0.5 |"
  const m3 = line.match(/\|\s*(\d+(?:\.\d+)?)\s*\|?\s*$/);
  if (m3) return parseFloat(m3[1]);
  return null;
}

/** Strip weight tokens and list markers to recover a clean label. */
function cleanLabel(line: string): string {
  return line
    .replace(/^\s*(?:\d+[.)]|[-*•·]|\|)\s*/, "") // leading list/table marker
    .replace(/[—–-]\s*\d+(?:\.\d+)?\s*(?:marks?|points?|pts?)\b.*$/i, "") // trailing "— N marks"
    .replace(/\d+(?:\.\d+)?\s*(?:marks?|points?|pts?)\b/i, "")
    .replace(/[([]\s*\d+(?:\.\d+)?\s*[)\]]\s*$/, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Seed regex DataChecks from Workday Studio tokens mentioned in the line. */
function seedChecks(label: string, idBase: string): DataCheck[] {
  const checks: DataCheck[] = [];

  // Explicit cc:/wd: tokens in the rule text become "has" checks.
  const ccTokens = Array.from(new Set((label.match(/\b(?:cc|wd|wm|wdnm):[a-zA-Z-]+/g) || []).map((s) => s)));
  for (const tok of ccTokens) {
    checks.push({ id: `${idBase}-${tok.replace(/[^a-z0-9]/gi, "")}`, label: `Contains ${tok}`, patterns: [tok.replace(/[-]/g, "\\-")], mode: "has" });
  }

  // application= mentions.
  if (/application\s*=|application attribute/i.test(label)) {
    checks.push({ id: `${idBase}-app`, label: "cc:workday-out-soap application= attribute present", patterns: ['application="'], mode: "has" });
  }
  // Generic keyword fallbacks so a criterion is never check-less.
  if (checks.length === 0) {
    const words = label
      .split(/\s+/)
      .filter((w) => w.length >= 4 && /^[A-Za-z][A-Za-z0-9_-]+$/.test(w))
      .slice(0, 3);
    if (words.length) {
      checks.push({
        id: `${idBase}-kw`,
        label: `Mentions ${words.join(" / ")}`,
        patterns: words.map((w) => w.replace(/[-]/g, "\\-")),
        mode: "has",
      });
    }
  }
  return checks;
}

const KNOWN_DEFAULT = new Map(DEFAULT_CRITERIA.map((c) => [c.id, c]));

let autoId = 0;
function nextId(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "rule";
  return `rule_${slug}_${++autoId}`;
}

/**
 * Parse rule-document text into a Rubric.
 * @param docTexts  one or more extracted rule-document strings
 * @param sourceName label for provenance shown in the editor
 */
export function parseRulesToRubric(docTexts: string[], sourceName = "rules"): Rubric {
  autoId = 0;
  const combined = docTexts.join("\n");
  const lines = combined.split(/\r?\n/);
  const criteria: Criterion[] = [];
  const usedBuiltins = new Set<string>();
  let issgSeen = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    const weight = extractWeight(line);
    // A line qualifies as a rubric item if it has a weight, or is a numbered/bulleted heading-like line.
    const looksLikeItem = weight !== null || /^\s*(?:\d+[.)]|[-*•·])\s+\S/.test(rawLine);
    if (!looksLikeItem) continue;

    const label = cleanLabel(line);
    if (!label || label.length < 3) continue;

    // ISSG → 0-point status criterion.
    if (ISSG_KEYWORD.test(label) && !issgSeen) {
      issgSeen = true;
      const def = KNOWN_DEFAULT.get("issg")!;
      criteria.push({ ...def, label, source: sourceName });
      continue;
    }

    // Map to a built-in evaluator when the label matches a known criterion.
    const builtin = BUILTIN_KEYWORDS.find((b) => b.keywords.test(label));
    if (builtin && !usedBuiltins.has(builtin.id)) {
      usedBuiltins.add(builtin.id);
      const def = KNOWN_DEFAULT.get(builtin.id)!;
      criteria.push({
        ...def,
        label,
        max: weight ?? def.max,
        source: sourceName,
      });
      continue;
    }

    // Otherwise, a fully data-driven criterion.
    const id = nextId(label);
    criteria.push({
      id,
      label,
      max: weight ?? 1,
      defaultMax: weight ?? 1,
      kind: "data-driven",
      checks: seedChecks(label, id),
      source: sourceName,
    });
  }

  // Always ensure an ISSG row exists (0-pt tenant check), like the original.
  if (!issgSeen) {
    criteria.push({ ...KNOWN_DEFAULT.get("issg")!, source: sourceName });
  }

  return { criteria };
}

/**
 * Merge parsed rules over the default rubric: parsed criteria win on weight/label
 * for matching built-ins; brand-new data-driven criteria are appended. Used when
 * the grader wants "defaults + extra rules from the doc".
 */
export function mergeWithDefaults(parsed: Rubric): Rubric {
  const byId = new Map(parsed.criteria.map((c) => [c.id, c]));
  const merged: Criterion[] = DEFAULT_CRITERIA.map((d) => byId.get(d.id) ?? { ...d });
  for (const c of parsed.criteria) {
    if (!DEFAULT_CRITERIA.some((d) => d.id === c.id)) merged.push(c);
  }
  return { criteria: merged };
}
