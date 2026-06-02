"use client";

import * as React from "react";
import { Plus, Trash2, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody, CardTag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CheckMode, Criterion } from "@/lib/types";

/**
 * Editable rubric review panel. The grader can tweak weights, edit/add/remove
 * data-driven checks (regex patterns from the parsed rule docs), and remove
 * criteria — all before running an evaluation. Built-in criteria keep their
 * ported matcher logic (their checks are computed, not listed here).
 */
export function RubricEditor() {
  const { rubric, updateCriterion, removeCriterion, addCheck, updateCheck, removeCheck, resetRubric } = useEvaluatorStore();
  const total = rubric.criteria.filter((c) => c.kind !== "issg").reduce((s, c) => s + c.max, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring Rubric — Review &amp; Adjust</CardTitle>
        <CardTag>{total.toFixed(2)} pts total</CardTag>
        <Button variant="ghost" size="sm" onClick={resetRubric} className="ml-2" title="Reset to default 10-point rubric">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </CardHeader>
      <CardBody className="space-y-2 p-3">
        {rubric.criteria.map((c) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            onMax={(max) => updateCriterion(c.id, { max })}
            onLabel={(label) => updateCriterion(c.id, { label })}
            onRemove={() => removeCriterion(c.id)}
            onAddCheck={() =>
              addCheck(c.id, { id: `${c.id}-chk-${Date.now()}`, label: "New check", patterns: [""], mode: "has", threshold: 1 })
            }
            onUpdateCheck={(checkId, patch) => updateCheck(c.id, checkId, patch)}
            onRemoveCheck={(checkId) => removeCheck(c.id, checkId)}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function CriterionRow({
  criterion: c,
  onMax,
  onLabel,
  onRemove,
  onAddCheck,
  onUpdateCheck,
  onRemoveCheck,
}: {
  criterion: Criterion;
  onMax: (n: number) => void;
  onLabel: (s: string) => void;
  onRemove: () => void;
  onAddCheck: () => void;
  onUpdateCheck: (checkId: string, patch: Partial<{ label: string; patterns: string[]; mode: CheckMode; threshold: number }>) => void;
  onRemoveCheck: (checkId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isData = c.kind === "data-driven";

  return (
    <div className="rounded-md border border-border bg-surface-2">
      <div className="flex items-center gap-2 px-3 py-2">
        {isData ? (
          <button onClick={() => setOpen((o) => !o)} className="text-text-3 hover:text-accent" title="Edit checks">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <input
          value={c.label}
          onChange={(e) => onLabel(e.target.value)}
          className="flex-1 bg-transparent font-mono text-xs text-text outline-none"
        />
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-text-3">
          {c.kind === "issg" ? "status" : c.kind === "builtin" ? "built-in" : "rules"}
        </span>
        {c.kind === "issg" ? (
          <span className="w-[88px] text-right font-mono text-[11px] text-text-3">pass/fail</span>
        ) : (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.25}
              value={c.max}
              onChange={(e) => onMax(parseFloat(e.target.value) || 0)}
              className="h-7 w-[72px] text-right"
            />
            <span className="font-mono text-[11px] text-text-3">pts</span>
          </div>
        )}
        <button onClick={onRemove} className="text-text-3 hover:text-danger" title="Remove criterion">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isData && open && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          {(c.checks || []).map((ck) => (
            <div key={ck.id} className="flex flex-wrap items-center gap-2">
              <Input value={ck.label} onChange={(e) => onUpdateCheck(ck.id, { label: e.target.value })} placeholder="Check label" className="h-7 flex-1 min-w-[140px]" />
              <Input
                value={ck.patterns.join(" | ")}
                onChange={(e) => onUpdateCheck(ck.id, { patterns: e.target.value.split("|").map((s) => s.trim()).filter(Boolean) })}
                placeholder="regex | regex"
                className="h-7 flex-1 min-w-[160px]"
                title="Pipe-separated regex patterns (case-insensitive)"
              />
              <select
                value={ck.mode}
                onChange={(e) => onUpdateCheck(ck.id, { mode: e.target.value as CheckMode })}
                className="h-7 rounded-md border border-border2 bg-surface-2 px-2 font-mono text-xs text-text"
              >
                <option value="has">has</option>
                <option value="count">count ≥</option>
              </select>
              {ck.mode === "count" && (
                <Input
                  type="number"
                  min={1}
                  value={ck.threshold ?? 1}
                  onChange={(e) => onUpdateCheck(ck.id, { threshold: parseInt(e.target.value) || 1 })}
                  className="h-7 w-[60px]"
                />
              )}
              <button onClick={() => onRemoveCheck(ck.id)} className="text-text-3 hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={onAddCheck}>
            <Plus className="h-3.5 w-3.5" /> Add check
          </Button>
        </div>
      )}
    </div>
  );
}
