import { describe, it, expect } from "vitest";
import { count, findFirst, has, esc } from "./matchers";

describe("matchers", () => {
  const sample = '<beans xmlns:cc="http://www.capeclear"><cc:async-mediation id="A"/><cc:async-mediation id="B"/></beans>';

  it("count() is case-insensitive and counts all occurrences", () => {
    expect(count(sample, "cc:async-mediation")).toBe(2);
    expect(count(sample, "CC:ASYNC-MEDIATION")).toBe(2);
    expect(count(sample, "does-not-exist")).toBe(0);
  });

  it("count() returns 0 for an invalid regex instead of throwing", () => {
    expect(count(sample, "(")).toBe(0);
  });

  it("findFirst() returns a trimmed evidence snippet or null", () => {
    expect(findFirst(sample, ["xmlns:cc"])).toContain("xmlns:cc");
    expect(findFirst(sample, ["nope"])).toBeNull();
  });

  it("has() is a boolean wrapper over findFirst()", () => {
    expect(has(sample, ["cc:async-mediation"])).toBe(true);
    expect(has(sample, ["zzz"])).toBe(false);
  });

  it("esc() escapes XML-significant characters", () => {
    expect(esc('<a & "b">')).toBe("&lt;a &amp; \"b\"&gt;");
    expect(esc(null)).toBe("");
  });
});
