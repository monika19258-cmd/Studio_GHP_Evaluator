import { describe, it, expect } from "vitest";
import { buildStudentResult, applyIsuAttachment, integrationNameFromFile } from "./run";
import { defaultRubric } from "./default-rubric";
import type { IsuAttachment } from "@/lib/types";

const rubric = defaultRubric();
const isuId = "isu";
const isuMax = rubric.criteria.find((c) => c.id === isuId)!.max;

function base() {
  return buildStudentResult({ id: "s", name: "s", fileName: "Int_Studio_Transformations.clar", text: "<assembly/>", rubric });
}

const attach = (over: Partial<IsuAttachment>): IsuAttachment => ({
  integrationName: "Int_Studio_Transformations",
  checked: true,
  attached: false,
  workdayAccount: null,
  ...over,
});

describe("integrationNameFromFile", () => {
  it("strips only the .clar extension", () => {
    expect(integrationNameFromFile("Int_Studio_Transformations.clar")).toBe("Int_Studio_Transformations");
    expect(integrationNameFromFile("Int_Studio_Transformations.CLAR")).toBe("Int_Studio_Transformations");
  });
});

describe("applyIsuAttachment", () => {
  it("ISU-Ready auto-scores full marks and clears manual when attached", () => {
    const before = base();
    expect(before.results[isuId].requiresManualScoring).toBe(true);
    const before_total = before.total;

    const after = applyIsuAttachment(before, rubric, attach({ attached: true, workdayAccount: "test isu" }));
    expect(after.results[isuId].score).toBe(isuMax);
    expect(after.results[isuId].requiresManualScoring).toBe(false);
    expect(after.total).toBeCloseTo(before_total + isuMax, 5);
    expect(after.isuAttachment?.workdayAccount).toBe("test isu");
    // A verification check is appended.
    expect(after.results[isuId].checks.some((c) => /RAAS-verified/i.test(c.label) && c.pass)).toBe(true);
  });

  it("ISU-Ready auto-scores 0 when not attached", () => {
    const after = applyIsuAttachment(base(), rubric, attach({ attached: false }));
    expect(after.results[isuId].score).toBe(0);
    expect(after.results[isuId].requiresManualScoring).toBe(false);
    expect(after.results[isuId].checks.some((c) => /NOT attached/i.test(c.label) && !c.pass)).toBe(true);
  });

  it("leaves the criterion manual when the lookup was not completed", () => {
    const after = applyIsuAttachment(base(), rubric, attach({ checked: false, error: "not configured" }));
    expect(after.results[isuId].requiresManualScoring).toBe(true);
    expect(after.results[isuId].score).toBe(0);
    // Attachment (with the error) is still recorded.
    expect(after.isuAttachment?.error).toBe("not configured");
  });
});
