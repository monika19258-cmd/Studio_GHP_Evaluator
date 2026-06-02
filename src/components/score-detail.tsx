"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, Trophy, PieChart, GraduationCap, ShieldCheck, Eye, Pencil, MessageCircle } from "lucide-react";
import type { Criterion, Rubric, StudentResult } from "@/lib/types";
import { getGradeInfo } from "@/lib/evaluation/observations";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function barColor(pct: number) {
  return pct >= 75 ? "#00d4a0" : pct >= 45 ? "#f59e0b" : "#ef4444";
}

/** Full detailed result for one student. Used by both single mode and batch drill-down. */
export function ScoreDetail({ student, rubric }: { student: StudentResult; rubric: Rubric }) {
  const setManualScore = useEvaluatorStore((s) => s.setManualScore);
  const grade = getGradeInfo(student.pct);
  const maxTotal = rubric.criteria.filter((c) => c.kind !== "issg").reduce((s, c) => s + c.max, 0);

  const cards = [
    { label: "Total Score", val: `${student.total.toFixed(2)} / ${maxTotal.toFixed(0)}`, Icon: Trophy, color: grade.color },
    { label: "Percentage", val: `${student.pct.toFixed(1)}%`, Icon: PieChart, color: grade.color },
    { label: "Grade", val: grade.label, Icon: GraduationCap, color: grade.color },
    {
      label: "ISSG",
      val: student.issg.status,
      Icon: ShieldCheck,
      color: student.issg.status === "pass" ? "#00d4a0" : student.issg.status === "partial" ? "#f59e0b" : "#ef4444",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {cards.map((m) => (
          <Card key={m.label} className="text-center">
            <CardBody className="p-3.5">
              <m.Icon className="mx-auto mb-1.5 h-[18px] w-[18px]" style={{ color: m.color }} />
              <div className="font-mono text-[19px] font-semibold leading-tight" style={{ color: m.color }}>
                {m.val}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-text-3">{m.label}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Eye className="h-4 w-4 text-text-2" />
          <CardTitle>Detailed Scores</CardTitle>
        </CardHeader>
        <div>
          {rubric.criteria.map((c) => (
            <ScoreRow key={c.id} criterion={c} student={student} onOverride={(v) => setManualScore(student.id, c.id, v)} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader className="border-b-danger/15 bg-danger/[0.06]">
          <Eye className="h-4 w-4 text-danger" />
          <CardTitle>Major Observations</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {student.observations.map((o, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border border-danger/20 bg-danger/10 font-mono text-[10px] font-bold text-danger">
                {i + 1}
              </span>
              <p className="font-mono text-xs leading-relaxed text-text-2">{o}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="rounded-md border border-accent/15 bg-accent/5 px-4 py-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
          <MessageCircle className="h-3.5 w-3.5" /> Overall Remarks
        </div>
        <p className="font-mono text-xs leading-relaxed text-text-2">{student.remark}</p>
      </div>
    </div>
  );
}

function ScoreRow({ criterion: c, student, onOverride }: { criterion: Criterion; student: StudentResult; onOverride: (v: number | undefined) => void }) {
  const [editing, setEditing] = React.useState(false);

  if (c.kind === "issg") {
    const res = student.issg;
    const variant = res.status === "pass" ? "pass" : res.status === "partial" ? "partial" : "fail";
    return (
      <div className="border-b border-border px-5 py-3.5 last:border-b-0">
        <div className="mb-1 flex items-start justify-between gap-3">
          <span className="font-mono text-[13px] font-semibold text-text">{c.label}</span>
          <Badge variant={variant}>{res.status}</Badge>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-text-2">{res.note}</p>
      </div>
    );
  }

  const res = student.results[c.id];
  if (!res) return null;
  const manual = student.manualScores[c.id];
  const needsManual = res.requiresManualScoring && manual === undefined;
  const score = manual !== undefined ? manual : res.score || 0;
  const pctBar = c.max > 0 ? (score / c.max) * 100 : 0;

  return (
    <div className="border-b border-border px-5 py-3.5 last:border-b-0">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="font-mono text-[13px] font-semibold text-text">{c.label}</span>
          {c.subItems && (
            <ul className="ml-3.5 mt-1 list-disc font-mono text-[11px] text-text-3">
              {c.subItems.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {needsManual && <span className="rounded-full bg-warn px-2 py-0.5 font-mono text-[10px] font-semibold text-black">MANUAL</span>}
          <span className="font-mono text-[15px] font-semibold" style={{ color: needsManual ? "#4a5268" : barColor(pctBar) }}>
            {needsManual ? "—" : score.toFixed(2)}
            <span className="font-normal text-text-3"> / {c.max}</span>
          </span>
          <button
            onClick={() => setEditing((e) => !e)}
            className={cn2("rounded-sm border p-1 transition-colors", needsManual ? "border-warn bg-warn text-black" : "border-border2 text-text-3 hover:border-accent hover:text-accent")}
            title={needsManual ? "Set score manually" : "Evaluator override"}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-2 flex items-center gap-2 py-1.5">
          <span className="font-mono text-[11px] text-warn">{needsManual ? "Manual score" : "Override"} (0–{c.max}):</span>
          <input
            type="number"
            min={0}
            max={c.max}
            step={0.25}
            defaultValue={score.toFixed(2)}
            id={`inp-${student.id}-${c.id}`}
            className="h-7 w-[75px] rounded-md border border-border2 bg-surface-2 px-2 font-mono text-sm text-text"
          />
          <button
            onClick={() => {
              const el = document.getElementById(`inp-${student.id}-${c.id}`) as HTMLInputElement | null;
              let v = Math.min(Math.max(parseFloat(el?.value || "0") || 0, 0), c.max);
              v = Math.round(v * 4) / 4;
              onOverride(v);
              setEditing(false);
            }}
            className="rounded-sm border border-accent bg-transparent px-2.5 py-1 font-mono text-[11px] text-accent"
          >
            Apply
          </button>
          <button onClick={() => { onOverride(undefined); setEditing(false); }} className="rounded-sm border border-border2 bg-transparent px-2.5 py-1 font-mono text-[11px] text-text-3">
            Reset
          </button>
        </div>
      )}

      {c.max > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded bg-surface-3">
          <div
            className="h-full rounded transition-[width] duration-1000"
            style={
              needsManual
                ? { width: "100%", background: "repeating-linear-gradient(45deg,rgba(245,158,11,0.2),rgba(245,158,11,0.2) 6px,rgba(245,158,11,0.4) 6px,rgba(245,158,11,0.4) 12px)" }
                : { width: `${pctBar.toFixed(1)}%`, background: barColor(pctBar) }
            }
          />
        </div>
      )}

      <div className="space-y-1">
        {res.checks.map((ck, i) => {
          const isInfo = res.requiresManualScoring && ck.pass;
          const Icon = ck.pass ? (isInfo ? Info : CheckCircle2) : XCircle;
          const color = ck.pass ? (isInfo ? "text-text-3" : "text-accent") : "text-danger";
          return (
            <div key={i} className="flex items-start gap-2 font-mono text-[11px] leading-relaxed">
              <Icon className={cn2("mt-0.5 h-3.5 w-3.5 flex-shrink-0", color)} />
              <span className="text-text-2">
                {ck.label}
                {ck.found && <span className="ml-1 mt-0.5 block break-all rounded-sm border-l-2 border-border2 bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-3">→ {ck.found}</span>}
              </span>
            </div>
          );
        })}
        {res.readinessHint && (
          <div className="mt-1.5 flex items-start gap-2 rounded-sm border-l-[3px] border-text-3 bg-[rgba(125,131,255,0.08)] px-2.5 py-1.5 font-mono text-[11.5px]">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-3" />
            <span className="text-text-2">
              <strong>Structural readiness:</strong> {res.readinessHint}
            </span>
          </div>
        )}
        {res.tenantNote && (
          <div className="mt-1.5 flex items-start gap-2 rounded-sm border-l-[3px] border-warn bg-warn/10 px-2.5 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warn" />
            <span className="font-mono text-[11px] text-text-2">
              <strong>{needsManual ? "Manual scoring required" : "Tenant verification required"}:</strong> {res.tenantNote}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Local cn to avoid an extra import cycle in this large component file.
function cn2(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
