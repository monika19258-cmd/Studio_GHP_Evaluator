/** Assemble a StudentResult from CLAR text, the rubric, and an optional reference. */
import type { Check, IsuAttachment, Rubric, StudentResult } from "@/lib/types";
import { evaluate, compareToReference } from "./engine";

export function buildStudentResult(args: { id: string; name: string; fileName: string; text: string; rubric: Rubric; referenceText?: string | null }): StudentResult {
  const { id, name, fileName, text, rubric, referenceText } = args;
  const out = evaluate(text, rubric);
  const observations = [...out.observations];
  if (referenceText) {
    const gaps = compareToReference(text, referenceText, rubric);
    if (gaps.length) observations.push("— Reference-CLAR gap analysis —", ...gaps);
  }
  return {
    id,
    name,
    fileName,
    status: "done",
    manualScores: {},
    raas: null,
    ...out,
    observations,
  };
}

/** Strip a known submission extension to get a display/student name. */
export function displayName(fileName: string): string {
  return fileName.replace(/\.(clar|xml|txt|docx|pdf|json|zip)$/i, "");
}

/** The integration name for a CLAR = its file name without the .clar extension. */
export function integrationNameFromFile(fileName: string): string {
  return fileName.replace(/\.clar$/i, "").trim();
}

/** Recompute total/pct from current results + manual overrides (mirrors the store). */
export function recomputeTotals(student: StudentResult, rubric: Rubric): StudentResult {
  const numeric = rubric.criteria.filter((c) => c.kind !== "issg" && c.max > 0);
  const maxTotal = numeric.reduce((s, c) => s + c.max, 0);
  const total = numeric.reduce((acc, c) => {
    const override = student.manualScores[c.id];
    const auto = student.results[c.id]?.score ?? 0;
    return acc + (override !== undefined ? override : auto);
  }, 0);
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  return { ...student, total, pct };
}

/**
 * Fold a RAAS-verified ISU attachment into a student result. When the lookup
 * succeeded it auto-resolves the (otherwise manual) ISU-Ready criterion:
 * attached → full marks, not attached → 0. A failed/skipped lookup leaves the
 * criterion as manual. Always records the attachment for display/CSV.
 */
export function applyIsuAttachment(student: StudentResult, rubric: Rubric, attachment: IsuAttachment): StudentResult {
  const next: StudentResult = { ...student, isuAttachment: attachment };
  if (!attachment.checked) return next; // config/network/auth failure → keep manual

  const isu = rubric.criteria.find((c) => c.kind === "builtin" && c.evaluatorKey === "isu");
  if (!isu) return next;
  const prev = next.results[isu.id];
  if (!prev) return next;

  const score = attachment.attached ? isu.max : 0;
  const verifyCheck: Check = {
    pass: attachment.attached,
    label: attachment.attached
      ? `Integration "${attachment.integrationName}" is attached to ISU "${attachment.workdayAccount}" (RAAS-verified)`
      : `Integration "${attachment.integrationName}" is NOT attached to any ISU (RAAS-verified)`,
    found: attachment.workdayAccount,
  };
  const tenantNote = attachment.attached
    ? `RAAS-verified: ISU "${attachment.workdayAccount}" is bound to integration "${attachment.integrationName}". Auto-scored ${score}/${isu.max}.`
    : `RAAS-verified: no ISU is bound to integration "${attachment.integrationName}". Auto-scored 0/${isu.max}.`;

  next.results = {
    ...next.results,
    [isu.id]: { ...prev, score, requiresManualScoring: false, checks: [...prev.checks, verifyCheck], tenantNote },
  };
  return recomputeTotals(next, rubric);
}
