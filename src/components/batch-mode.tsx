"use client";

import * as React from "react";
import { ScanLine, RefreshCw, Download, Files, X, FileCode } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody, CardTag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/file-drop";
import { RuleUpload } from "@/components/rule-upload";
import { RubricEditor } from "@/components/rubric-editor";
import { ComparisonTable } from "@/components/comparison-table";
import { RaasPanel } from "@/components/raas-panel";
import { DownloadActivity } from "@/components/download-activity";
import { Progress } from "@/components/ui/progress";
import { readFile } from "@/lib/parsing/file-readers";
import { buildStudentResult, displayName } from "@/lib/evaluation/run";
import { buildCsv, downloadCsv } from "@/lib/csv";
import type { StudentResult } from "@/lib/types";

export function BatchMode() {
  const { rubric, referenceText, students, setStudents, raasRows, downloadEvents } = useEvaluatorStore();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<"upload" | "loading" | "result">("upload");
  const [progress, setProgress] = React.useState(0);
  const [progressMsg, setProgressMsg] = React.useState("");

  function addFiles(list: FileList) {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const next = [...prev];
      for (const f of Array.from(list)) if (!names.has(f.name)) next.push(f);
      return next;
    });
  }
  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  async function run() {
    if (files.length === 0) return;
    setPhase("loading");
    const out: StudentResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgressMsg(`Evaluating ${f.name} (${i + 1}/${files.length})`);
      setProgress(((i + 0.5) / files.length) * 100);
      try {
        const text = await readFile(f);
        out.push(buildStudentResult({ id: f.name, name: displayName(f.name), fileName: f.name, text, rubric, referenceText }));
      } catch (e) {
        out.push({
          id: f.name,
          name: displayName(f.name),
          fileName: f.name,
          status: "error",
          error: e instanceof Error ? e.message : "Parse error",
          manualScores: {},
          results: {},
          issg: { status: "na", note: "" },
          observations: [],
          remark: "",
          total: 0,
          pct: 0,
        });
      }
      // Yield so the progress bar paints.
      await new Promise((r) => setTimeout(r, 10));
    }
    setProgress(100);
    setStudents(out);
    setPhase("result");
  }

  function reset() {
    setStudents([]);
    setFiles([]);
    setProgress(0);
    setPhase("upload");
  }

  if (phase === "loading") {
    return (
      <Card>
        <CardBody className="flex flex-col items-center py-14 text-center">
          <div className="spinner mb-6" />
          <p className="font-mono text-sm text-text-2">{progressMsg || "Analysing CLAR files…"}</p>
          <div className="mx-auto mt-4 w-full max-w-[300px]">
            <Progress value={progress} />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (phase === "result") {
    const done = students.filter((s) => s.status === "done");
    const avg = done.length ? done.reduce((a, s) => a + s.total, 0) / done.length : 0;
    const sorted = [...done].sort((a, b) => b.total - a.total);
    return (
      <div className="space-y-5">
        <RaasPanel />
        <DownloadActivity />
        <Card>
          <CardHeader>
            <Files className="h-4 w-4 text-text-2" />
            <CardTitle>Batch Comparison</CardTitle>
            <CardTag>{done.length} student{done.length === 1 ? "" : "s"}</CardTag>
          </CardHeader>
          <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface-2 px-5 py-3.5 font-mono text-xs text-text-2">
            <span><strong className="mr-1 text-text">Students</strong>{done.length}</span>
            <span><strong className="mr-1 text-text">Avg</strong>{avg.toFixed(2)}</span>
            {sorted[0] && <span className="text-accent"><strong className="mr-1">Highest</strong>{sorted[0].total.toFixed(2)}</span>}
            {sorted.length > 0 && <span><strong className="mr-1 text-text">Lowest</strong>{sorted[sorted.length - 1].total.toFixed(2)}</span>}
          </div>
          <CardBody className="p-0">
            <ComparisonTable students={students} rubric={rubric} raasEnabled={raasRows.length > 0} />
          </CardBody>
        </Card>
        <div className="grid grid-cols-2 gap-2.5 no-print">
          <Button variant="secondary" size="lg" onClick={() => downloadCsv(buildCsv(students, rubric, downloadEvents))}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="secondary" size="lg" onClick={reset}>
            <RefreshCw className="h-4 w-4" /> New Batch
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <RuleUpload />
      <Card>
        <CardHeader>
          <Files className="h-4 w-4 text-text-2" />
          <CardTitle>Student CLAR Files</CardTitle>
          <CardTag>{files.length} file{files.length === 1 ? "" : "s"}</CardTag>
        </CardHeader>
        <CardBody className="space-y-3">
          <FileDrop
            big
            label="Drop multiple CLAR files here"
            sublabel="or click to browse · .clar .xml .txt .docx .pdf · one student per file"
            accept=".txt,.xml,.clar,.zip,.json,.doc,.docx,.pdf"
            multiple
            onFiles={addFiles}
          />
          {files.length > 0 && (
            <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs">
                  <FileCode className="h-3.5 w-3.5 text-text-3" />
                  <span className="flex-1 truncate text-text-2" title={f.name}>{f.name}</span>
                  <button onClick={() => removeFile(f.name)} className="text-text-3 hover:text-danger">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button size="lg" disabled={files.length === 0} onClick={run}>
            <ScanLine className="h-4 w-4" /> Analyse All &amp; Grade
          </Button>
        </CardBody>
      </Card>
      <RubricEditor />
    </div>
  );
}
