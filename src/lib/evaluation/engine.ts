/**
 * ──────────────────────────────────────────────────────────────────────────
 *  DATA-DRIVEN EVALUATION ENGINE
 *
 *  evaluate(text, rubric) walks the rubric's criteria:
 *   • kind "builtin"      → runs the ported pure evaluator and scales the score
 *                           proportionally if the grader edited the weight.
 *   • kind "data-driven"  → runs the criterion's regex DataChecks (from rule
 *                           docs) and scores proportionally to checks passed.
 *   • kind "issg"         → pass/partial/fail status (no numeric score).
 *
 *  This keeps the original behavior identical when the default rubric is used,
 *  while letting new rules parsed from documents be added without code changes.
 * ──────────────────────────────────────────────────────────────────────────
 */
import type { Check, Criterion, CriterionResult, EvaluationOutput, Rubric } from "@/lib/types";
import { BUILTIN_EVALUATORS, evalISSG } from "./criteria";
import { count, findFirst } from "./matchers";
import { buildObservations, buildRemark } from "./observations";

/** Score a data-driven criterion proportionally to the number of checks passed. */
function evaluateDataDriven(text: string, criterion: Criterion): CriterionResult {
  const checks: Check[] = (criterion.checks || []).map((dc) => {
    const threshold = dc.threshold ?? 1;
    let pass: boolean;
    let found: string | null;
    if (dc.mode === "count") {
      const total = dc.patterns.reduce((acc, p) => acc + count(text, p), 0);
      pass = total >= threshold;
      found = findFirst(text, dc.patterns);
    } else {
      found = findFirst(text, dc.patterns);
      pass = found !== null;
    }
    return { pass, label: dc.label, found };
  });

  const passed = checks.filter((c) => c.pass).length;
  const ratio = checks.length > 0 ? passed / checks.length : 0;
  // Round to nearest 0.25 step to match the override granularity used elsewhere.
  const raw = ratio * criterion.max;
  const score = Math.round(raw * 4) / 4;
  return { score: Math.min(score, criterion.max), checks };
}

/** Run a built-in evaluator and scale to the (possibly edited) criterion weight. */
function evaluateBuiltin(text: string, criterion: Criterion): CriterionResult {
  const fn = criterion.evaluatorKey ? BUILTIN_EVALUATORS[criterion.evaluatorKey] : undefined;
  if (!fn) return { score: 0, checks: [{ pass: false, label: "Unknown built-in evaluator", found: null }] };
  const result = fn(text);
  // Scale proportionally when the grader changed the weight away from the default.
  if (criterion.defaultMax > 0 && criterion.max !== criterion.defaultMax && !result.requiresManualScoring) {
    const scaled = (result.score / criterion.defaultMax) * criterion.max;
    return { ...result, score: Math.min(Math.round(scaled * 4) / 4, criterion.max) };
  }
  return result;
}

/**
 * Evaluate a CLAR text against a rubric.
 * Pure and deterministic — safe to unit test and to run in batch.
 */
export function evaluate(text: string, rubric: Rubric): EvaluationOutput {
  const results: Record<string, CriterionResult> = {};
  let issg = evalISSG(text);

  for (const criterion of rubric.criteria) {
    if (criterion.kind === "issg") {
      issg = evalISSG(text);
      continue;
    }
    results[criterion.id] = criterion.kind === "builtin" ? evaluateBuiltin(text, criterion) : evaluateDataDriven(text, criterion);
  }

  const observations = buildObservations({ text, results });

  const numericCriteria = rubric.criteria.filter((c) => c.kind !== "issg" && c.max > 0);
  const maxTotal = numericCriteria.reduce((s, c) => s + c.max, 0);
  const total = numericCriteria.reduce((s, c) => s + (results[c.id]?.score || 0), 0);
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const remark = buildRemark(pct);

  return { results, issg, observations, remark, total, pct };
}

/**
 * Reference-CLAR gap analysis.
 * Surfaces built-in/data-driven checks that the reference answer passes but the
 * student does not — appended to observations so the grader sees where a
 * submission diverges from the answer key. Lightweight and non-scoring.
 */
export function compareToReference(studentText: string, referenceText: string, rubric: Rubric): string[] {
  const gaps: string[] = [];
  const stu = evaluate(studentText, rubric);
  const ref = evaluate(referenceText, rubric);

  for (const criterion of rubric.criteria) {
    if (criterion.kind === "issg") continue;
    const stuRes = stu.results[criterion.id];
    const refRes = ref.results[criterion.id];
    if (!stuRes || !refRes) continue;
    const refChecks = refRes.checks;
    const stuChecks = stuRes.checks;
    for (let i = 0; i < refChecks.length; i++) {
      const rc = refChecks[i];
      const sc = stuChecks[i];
      if (rc?.pass && sc && !sc.pass) {
        gaps.push(`[${criterion.label}] Reference passes but student fails: ${sc.label}`);
      }
    }
  }
  return gaps;
}

/** Total possible (numeric) marks for a rubric — used for percentage and CSV. */
export function rubricMaxTotal(rubric: Rubric): number {
  return rubric.criteria.filter((c) => c.kind !== "issg").reduce((s, c) => s + c.max, 0);
}
