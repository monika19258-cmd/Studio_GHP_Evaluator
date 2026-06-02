import { describe, it, expect } from "vitest";
import { applyDateRange } from "./schema";

const BASE =
  "https://wd2-impl-services1.workday.com/ccx/service/customreport2/accenture_dpt3/rsaklani-trn/View_User_Activity_-_MG" +
  "?To_Moment=2026-06-02T07:51:36.496-07:00&From_Moment=2026-06-01T07:51:36.496-07:00&format=json";

describe("applyDateRange", () => {
  it("rewrites From_Moment to start of day and To_Moment to end of day", () => {
    const url = applyDateRange(BASE, "2026-06-10", "2026-06-12");
    expect(url).toContain("From_Moment=2026-06-10T00:00:00.000-07:00");
    expect(url).toContain("To_Moment=2026-06-12T23:59:59.999-07:00");
  });

  it("preserves the timezone offset already present in the URL", () => {
    const ist = BASE.replace(/-07:00/g, "+05:30");
    const url = applyDateRange(ist, "2026-06-10", "2026-06-12");
    expect(url).toContain("From_Moment=2026-06-10T00:00:00.000+05:30");
    expect(url).toContain("To_Moment=2026-06-12T23:59:59.999+05:30");
  });

  it("keeps other query params (e.g. format) intact", () => {
    const url = applyDateRange(BASE, "2026-06-10", "2026-06-12");
    expect(url).toContain("format=json");
  });

  it("appends the moments when the URL has none, using the fallback offset", () => {
    const bare = "https://wd2-impl-services1.workday.com/ccx/service/customreport2/t/o/View_User_Activity?format=json";
    const url = applyDateRange(bare, "2026-06-10", "2026-06-12", "Z");
    expect(url).toContain("From_Moment=2026-06-10T00:00:00.000Z");
    expect(url).toContain("To_Moment=2026-06-12T23:59:59.999Z");
    expect(url).toContain("format=json");
  });

  it("leaves the URL unchanged when no dates are supplied", () => {
    expect(applyDateRange(BASE)).toBe(BASE);
  });

  it("only rewrites the supplied bound", () => {
    const url = applyDateRange(BASE, undefined, "2026-06-12");
    expect(url).toContain("To_Moment=2026-06-12T23:59:59.999-07:00");
    expect(url).toContain("From_Moment=2026-06-01T07:51:36.496-07:00"); // untouched
  });
});
