import type { Rubric, Criterion } from "@/lib/types";

/**
 * The default 10-point rubric, ported from the original tool. Each criterion is
 * `kind: "builtin"` and wired to a ported evaluator via `evaluatorKey`. Weights
 * (`max`) are editable in the UI; `defaultMax` lets the engine scale a built-in
 * score proportionally if the grader changes the weight.
 *
 * Data-driven criteria parsed from rule documents are appended to this list at
 * runtime (see lib/rubric/rule-parser.ts) — no code change required to add rules.
 */
export const DEFAULT_CRITERIA: Criterion[] = [
  { id: "arrangement", label: "Overall arrangement of assembly in Project CLAR", max: 0.5, defaultMax: 0.5, kind: "builtin", evaluatorKey: "arrangement", source: "default" },
  { id: "swimlanes", label: "Inclusion of swimlanes", max: 0.25, defaultMax: 0.25, kind: "builtin", evaluatorKey: "swimlanes", source: "default" },
  { id: "error_handler", label: "Inclusion of Global Error Handler", max: 1.5, defaultMax: 1.5, kind: "builtin", evaluatorKey: "error_handler", source: "default" },
  { id: "send_error", label: "Local Error Handler (cc:send-error per component)", max: 0.25, defaultMax: 0.25, kind: "builtin", evaluatorKey: "send_error", source: "default" },
  { id: "naming_integration", label: "Proper Naming convention of Outbound / Inbound Integrations", max: 1.0, defaultMax: 1.0, kind: "builtin", evaluatorKey: "naming_integration", source: "default" },
  {
    id: "core_logic",
    label: "Core Logical Part",
    max: 4.0,
    defaultMax: 4.0,
    kind: "builtin",
    evaluatorKey: "core_logic",
    source: "default",
    subItems: [
      "Workplace Tests loaded in tenant with proper cloud log (error/warning/success) — 1 mark",
      "Usage of relevant web service and Version details — 1 mark",
      "Workplace Tests loaded from Exam input file at one time with downstream error handlers — 1 mark",
      "Outbound File Validation (.txt File) — 1 mark",
    ],
  },
  { id: "naming_components", label: "Naming Convention of Studio components", max: 0.25, defaultMax: 0.25, kind: "builtin", evaluatorKey: "naming_components", source: "default" },
  { id: "no_logs", label: "Not having logs in the assembly", max: 0.25, defaultMax: 0.25, kind: "builtin", evaluatorKey: "no_logs", source: "default" },
  { id: "cloud_log", label: "Usage of Cloud-log (grace marking)", max: 1.0, defaultMax: 1.0, kind: "builtin", evaluatorKey: "cloud_log", source: "default" },
  { id: "isu", label: "ISU-Ready Configuration (tenant binding verified separately)", max: 1.0, defaultMax: 1.0, kind: "builtin", evaluatorKey: "isu", manual: true, source: "default" },
  { id: "issg", label: "ISSG Tenant Binding (verified in Workday tenant)", max: 0, defaultMax: 0, kind: "issg", scoreless: true, source: "default" },
];

/** A fresh, deep-cloned copy of the default rubric. */
export function defaultRubric(): Rubric {
  return { criteria: DEFAULT_CRITERIA.map((c) => ({ ...c, subItems: c.subItems ? [...c.subItems] : undefined })) };
}
