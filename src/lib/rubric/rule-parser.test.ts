import { describe, it, expect } from "vitest";
import { parseRulesToRubric, mergeWithDefaults } from "./rule-parser";

const RULES = `
Scoring Rubric — GHP Final Exam

1. Overall arrangement of assembly in Project CLAR — 0.5 marks
2. Inclusion of swimlanes — 0.25 marks
3. Inclusion of Global Error Handler — 1.5 marks
4. Core Logical Part — 4 marks
5. Custom rule: Outbound file must be .txt and contain cc:store — 1 mark
6. ISSG Tenant Binding (verified in tenant) — 0 marks
`;

describe("rule-document parser", () => {
  it("extracts criteria with weights from a rule document", () => {
    const rubric = parseRulesToRubric([RULES], "rules.txt");
    const labels = rubric.criteria.map((c) => c.label);
    expect(labels.some((l) => /arrangement/i.test(l))).toBe(true);
    const arrangement = rubric.criteria.find((c) => /arrangement/i.test(c.label));
    expect(arrangement?.max).toBe(0.5);
  });

  it("maps known rules to built-in evaluators (reusing ported logic)", () => {
    const rubric = parseRulesToRubric([RULES], "rules.txt");
    const core = rubric.criteria.find((c) => /core logic/i.test(c.label));
    expect(core?.kind).toBe("builtin");
    expect(core?.evaluatorKey).toBe("core_logic");
    expect(core?.max).toBe(4);
  });

  it("creates a data-driven criterion for an unknown custom rule, seeded with checks", () => {
    const rubric = parseRulesToRubric([RULES], "rules.txt");
    const custom = rubric.criteria.find((c) => /outbound file/i.test(c.label));
    expect(custom?.kind).toBe("data-driven");
    expect((custom?.checks?.length ?? 0)).toBeGreaterThan(0);
    expect(custom?.max).toBe(1);
  });

  it("always includes an ISSG status criterion", () => {
    const rubric = parseRulesToRubric([RULES], "rules.txt");
    expect(rubric.criteria.some((c) => c.kind === "issg")).toBe(true);
  });

  it("mergeWithDefaults keeps all default criteria and appends new ones", () => {
    const parsed = parseRulesToRubric([RULES], "rules.txt");
    const merged = mergeWithDefaults(parsed);
    const defaultIds = ["arrangement", "swimlanes", "error_handler", "send_error", "naming_integration", "core_logic", "naming_components", "no_logs", "cloud_log", "isu", "issg"];
    // Every default criterion id is still present after the merge.
    for (const id of defaultIds) expect(merged.criteria.some((c) => c.id === id)).toBe(true);
    // The custom data-driven rule is appended.
    expect(merged.criteria.some((c) => /outbound file/i.test(c.label))).toBe(true);
    // Parsed weights win for matching built-ins (Global EH parsed as 1.5).
    expect(merged.criteria.find((c) => c.id === "error_handler")?.max).toBe(1.5);
  });
});
