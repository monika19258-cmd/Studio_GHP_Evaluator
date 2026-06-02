/** Client-side CSV export of batch results, including RAAS activity columns. */
import type { Criterion, DownloadEvent, Rubric, StudentResult } from "@/lib/types";
import { getGradeInfo } from "@/lib/evaluation/observations";
import { downloadCountForStudent } from "@/lib/raas/cheating";

function abbreviate(label: string): string {
  const map: Record<string, string> = {
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
  return map[label] || label.substring(0, 14);
}

function effectiveScore(student: StudentResult, c: Criterion): string {
  if (student.manualScores[c.id] !== undefined) return student.manualScores[c.id].toFixed(2);
  const res = student.results[c.id];
  if (!res) return "—";
  if (res.requiresManualScoring) return "MANUAL";
  return (res.score || 0).toFixed(2);
}

export function buildCsv(students: StudentResult[], rubric: Rubric, downloadEvents: DownloadEvent[] = []): string {
  const sorted = [...students].filter((s) => s.status === "done").sort((a, b) => b.total - a.total);
  const scoring = rubric.criteria.filter((c) => c.kind !== "issg");

  const header = [
    "Rank",
    "Student",
    ...scoring.map((c) => abbreviate(c.label)),
    "Total",
    "Percentage",
    "Grade",
    "ISSG",
    "RAAS Matched",
    "CLAR Downloads",
    "Last Activity",
  ];

  const rows = sorted.map((s, i) => {
    const grade = getGradeInfo(s.pct);
    const cols: (string | number)[] = [
      i + 1,
      s.name,
      ...scoring.map((c) => effectiveScore(s, c)),
      s.total.toFixed(2),
      s.pct.toFixed(1) + "%",
      grade.label,
      s.issg.status,
      s.raas ? "yes" : "no",
      downloadCountForStudent(s.name, downloadEvents),
      s.raas?.lastActivity ?? "",
    ];
    return cols.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",");
  });

  return [header.map((c) => '"' + c + '"').join(","), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename = "clar_batch_results.csv") {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
