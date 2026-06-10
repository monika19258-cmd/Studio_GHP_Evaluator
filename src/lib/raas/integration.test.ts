import { describe, it, expect } from "vitest";
import { buildIntegrationUrl, extractIsuAttachment } from "./integration";

// The sample RAAS output the grader provided.
const SAMPLE = {
  Report_Entry: [
    {
      Integration_System: "Int_Studio_Transformations",
      System_Name: "Int_Studio_Transformations",
      Workday_Account: "test isu",
      referenceID: "Int_Studio_Transformations/Int_Studio_Transformations/StartHere",
    },
  ],
};

describe("buildIntegrationUrl", () => {
  it("substitutes the {integration} placeholder (URL-encoded)", () => {
    const url = buildIntegrationUrl("https://x/Integration_ISU?Integration_System_Name={integration}&format=json", "Int Studio Transformations");
    expect(url).toBe("https://x/Integration_ISU?Integration_System_Name=Int%20Studio%20Transformations&format=json");
  });

  it("sets a configured prompt param when there is no placeholder", () => {
    const url = buildIntegrationUrl("https://x/Integration_ISU?format=json", "Int_Studio_Transformations", "Integration_System_Name");
    expect(url).toContain("Integration_System_Name=Int_Studio_Transformations");
    expect(url).toContain("format=json");
  });

  it("appends a default param when neither placeholder nor param is given", () => {
    const url = buildIntegrationUrl("https://x/Integration_ISU", "Int_Studio_Transformations");
    expect(url).toBe("https://x/Integration_ISU?Integration_System_Name=Int_Studio_Transformations");
  });
});

describe("extractIsuAttachment", () => {
  it("reports attached + the Workday_Account when present", () => {
    const a = extractIsuAttachment(SAMPLE, "Int_Studio_Transformations");
    expect(a.attached).toBe(true);
    expect(a.workdayAccount).toBe("test isu");
    expect(a.integrationSystem).toBe("Int_Studio_Transformations");
    expect(a.referenceId).toContain("StartHere");
  });

  it("reports not-attached when there are no rows", () => {
    const a = extractIsuAttachment({ Report_Entry: [] }, "Nope");
    expect(a.attached).toBe(false);
    expect(a.workdayAccount).toBeNull();
  });

  it("reports not-attached when Workday_Account is blank", () => {
    const a = extractIsuAttachment({ Report_Entry: [{ Integration_System: "X", Workday_Account: "  " }] }, "X");
    expect(a.attached).toBe(false);
    expect(a.workdayAccount).toBeNull();
  });

  it("tolerates wd: prefixes and spaced column names", () => {
    const a = extractIsuAttachment({ Report_Entry: [{ "wd:Workday Account": "ISU-Foo" }] }, "Foo");
    expect(a.attached).toBe(true);
    expect(a.workdayAccount).toBe("ISU-Foo");
  });
});
