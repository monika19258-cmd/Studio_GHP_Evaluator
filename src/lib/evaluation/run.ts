/** Assemble a StudentResult from CLAR text, the rubric, and an optional reference. */
import type { Rubric, StudentResult } from "@/lib/types";
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
