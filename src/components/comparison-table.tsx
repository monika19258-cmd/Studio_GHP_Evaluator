"use client";

import * as React from "react";
import { Eye, User, CircleX } from "lucide-react";
import type { Rubric, StudentResult } from "@/lib/types";
import { getGradeInfo } from "@/lib/evaluation/observations";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ScoreDetail } from "@/components/score-detail";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { downloadCountForStudent } from "@/lib/raas/cheating";
import { cn } from "@/lib/utils";

const ABBR: Record<string, string> = {
  "Overall arrangement of assembly in Project CLAR": "Arrangement",
  "Inclusion of swimlanes": "Swimlanes",
  "Inclusion of Global Error Handler": "Global EH",
  "Local Error Handler (cc:send-error per component)": "Local EH",
  "Proper Naming convention of Outbound / Inbound Integrations": "Int. Name",
  "Core Logical Part": "Core Logic",
  "Naming Convention of Studio components": "Comp. Name",
  "Not having logs in the assembly": "No Logs",
  "Usage of Cloud-log (grace marking)": "Cloud Log",
  "ISU-Ready Configuration (tenant binding verified separately)": "ISU",
};
const abbr = (label: string) => ABBR[label] || label.substring(0, 10);

function scoreCellClass(pct: number) {
  return pct >= 75 ? "bg-accent/15 text-accent" : pct >= 40 ? "bg-warn/15 text-warn" : "bg-danger/10 text-danger";
}

export function ComparisonTable({ students, rubric, raasEnabled }: { students: StudentResult[]; rubric: Rubric; raasEnabled: boolean }) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const downloadEvents = useEvaluatorStore((s) => s.downloadEvents);
  const scoring = rubric.criteria.filter((c) => c.kind !== "issg");
  const done = [...students].filter((s) => s.status === "done").sort((a, b) => b.total - a.total);
  const errored = students.filter((s) => s.status === "error");
  const isuEnabled = students.some((s) => s.isuAttachment);
  // Full-row spans for the drill-down and error rows (kept in sync with the optional columns).
  const detailSpan = scoring.length + 5 + (raasEnabled ? 1 : 0) + (isuEnabled ? 1 : 0);
  const errorSpan = scoring.length + 4 + (raasEnabled ? 1 : 0) + (isuEnabled ? 1 : 0);

  return (
    <div className="space-y-4">
      <Table className="min-w-[900px]">
        <THead>
          <tr>
            <TH className="sticky left-0 z-10 min-w-[160px] text-left">
              <User className="mr-1 inline h-3 w-3 align-[-2px]" />
              Student
            </TH>
            {scoring.map((c) => (
              <TH key={c.id} title={c.label}>
                {abbr(c.label)}
              </TH>
            ))}
            <TH>Total</TH>
            <TH>%</TH>
            <TH>Grade</TH>
            {raasEnabled && <TH title="Workday RAAS user activity">Activity</TH>}
            {isuEnabled && <TH title="Integration→ISU attachment (RAAS-verified)">ISU Attach</TH>}
            <TH />
          </tr>
        </THead>
        <TBody>
          {done.map((s, idx) => {
            const grade = getGradeInfo(s.pct);
            const rank = idx + 1;
            const rankClass =
              rank === 1
                ? "bg-[rgba(255,215,0,0.2)] text-[#ffd700] border-[rgba(255,215,0,0.3)]"
                : rank === 2
                ? "bg-[rgba(192,192,192,0.2)] text-[#c0c0c0] border-[rgba(192,192,192,0.3)]"
                : rank === 3
                ? "bg-[rgba(205,127,50,0.2)] text-[#cd7f32] border-[rgba(205,127,50,0.3)]"
                : "bg-surface-3 text-text-3 border-border";
            return (
              <React.Fragment key={s.id}>
                <tr className="hover:[&>td]:brightness-110">
                  <TD className="sticky left-0 z-[1] whitespace-nowrap bg-surface text-left font-semibold text-text">
                    <span className={cn("mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold", rankClass)}>{rank}</span>
                    {s.name}
                  </TD>
                  {scoring.map((c) => {
                    const res = s.results[c.id];
                    const manual = s.manualScores[c.id];
                    if (c.max === 0) return <TD key={c.id}>—</TD>;
                    if (res?.requiresManualScoring && manual === undefined)
                      return (
                        <TD key={c.id}>
                          <span className="inline-block min-w-[42px] rounded-sm bg-surface-3 px-2 py-1 text-text-3" title="Manual scoring required">
                            M
                          </span>
                        </TD>
                      );
                    const sc = manual !== undefined ? manual : res?.score || 0;
                    return (
                      <TD key={c.id}>
                        <span className={cn("inline-block min-w-[42px] rounded-sm px-2 py-1 font-semibold", scoreCellClass((sc / c.max) * 100))}>{sc.toFixed(2)}</span>
                      </TD>
                    );
                  })}
                  <TD>
                    <span className="font-mono text-sm font-bold" style={{ color: grade.color }}>
                      {s.total.toFixed(2)}
                    </span>
                  </TD>
                  <TD style={{ color: grade.color }} className="font-mono text-xs font-semibold">
                    {s.pct.toFixed(1)}%
                  </TD>
                  <TD>
                    <span className={cn("inline-block rounded-sm px-2 py-1 text-[10px]", scoreCellClass(s.pct))}>{grade.label}</span>
                  </TD>
                  {raasEnabled && (
                    <TD className="text-[10px]">
                      {(() => {
                        const downloads = downloadCountForStudent(s.name, downloadEvents);
                        if (downloads > 0)
                          return (
                            <span className="font-semibold text-danger" title="Studio CLAR download events">
                              {downloads} download{downloads === 1 ? "" : "s"}
                            </span>
                          );
                        if (s.raas) return <span className="text-accent" title={`Last: ${s.raas.lastActivity ?? "n/a"}`}>matched</span>;
                        return <span className="text-text-3">no match</span>;
                      })()}
                    </TD>
                  )}
                  {isuEnabled && (
                    <TD className="text-[10px]">
                      {(() => {
                        const a = s.isuAttachment;
                        if (!a || !a.checked) return <span className="text-text-3" title={a?.error ?? "Not checked"}>—</span>;
                        if (a.attached)
                          return <span className="font-semibold text-accent" title={`Integration: ${a.integrationName}`}>{a.workdayAccount}</span>;
                        return <span className="font-semibold text-danger" title={`Integration: ${a.integrationName}`}>not attached</span>;
                      })()}
                    </TD>
                  )}
                  <TD>
                    <button
                      onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                      className="whitespace-nowrap rounded-sm border border-border2 px-2 py-1 font-mono text-[10px] text-text-3 transition-colors hover:border-accent hover:text-accent"
                    >
                      <Eye className="mr-1 inline h-3 w-3 align-[-1px]" />
                      Detail
                    </button>
                  </TD>
                </tr>
                {openIdx === idx && (
                  <tr>
                    <td colSpan={detailSpan} className="bg-surface-2 p-4">
                      <ScoreDetail student={s} rubric={rubric} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {errored.map((s) => (
            <tr key={s.id}>
              <TD className="sticky left-0 whitespace-nowrap bg-surface text-left text-danger">
                <CircleX className="mr-1.5 inline h-3 w-3 align-[-1px]" />
                {s.name}
              </TD>
              <td colSpan={errorSpan} className="border-b border-border px-2.5 py-2 font-mono text-[11px] text-text-3">
                Parse error: {s.error || "Unknown error"}
              </td>
            </tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
