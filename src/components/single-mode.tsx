"use client";

import * as React from "react";
import { ScanLine, RefreshCw, Printer, Info } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/file-drop";
import { RuleUpload } from "@/components/rule-upload";
import { RubricEditor } from "@/components/rubric-editor";
import { ScoreDetail } from "@/components/score-detail";
import { readFile } from "@/lib/parsing/file-readers";
import { buildStudentResult, displayName } from "@/lib/evaluation/run";

export function SingleMode() {
  const { rubric, referenceText, students, setStudents } = useEvaluatorStore();
  const [studentFile, setStudentFile] = React.useState<File | null>(null);
  const [phase, setPhase] = React.useState<"upload" | "loading" | "result">("upload");
  const [err, setErr] = React.useState<string | null>(null);

  const result = students[0];

  async function run() {
    if (!studentFile) return;
    setPhase("loading");
    setErr(null);
    try {
      const text = await readFile(studentFile);
      const sr = buildStudentResult({
        id: "single",
        name: displayName(studentFile.name),
        fileName: studentFile.name,
        text,
        rubric,
        referenceText,
      });
      setStudents([sr]);
      setPhase("result");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analysis error");
      setPhase("upload");
    }
  }

  function reset() {
    setStudents([]);
    setStudentFile(null);
    setPhase("upload");
  }

  if (phase === "loading") {
    return (
      <Card>
        <CardBody className="flex flex-col items-center py-14 text-center">
          <div className="spinner mb-6" />
          <p className="font-mono text-sm text-text-2">Analysing CLAR structure…</p>
          <p className="mt-1.5 font-mono text-[11px] text-text-3">Checking patterns, naming conventions and logic components</p>
        </CardBody>
      </Card>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="space-y-5">
        <ScoreDetail student={result} rubric={rubric} />
        <div className="grid grid-cols-2 gap-2.5 no-print">
          <Button variant="secondary" size="lg" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
          <Button variant="secondary" size="lg" onClick={reset}>
            <RefreshCw className="h-4 w-4" /> Evaluate Another
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
          <ScanLine className="h-4 w-4 text-text-2" />
          <CardTitle>Student CLAR File</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <FileDrop
            big
            label="Student CLAR File"
            sublabel=".clar .xml .zip .txt .docx .pdf"
            accept=".txt,.xml,.clar,.zip,.json,.doc,.docx,.pdf"
            loadedName={studentFile?.name ?? null}
            onFiles={(files) => setStudentFile(files[0])}
          />
          <div className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn/10 px-3.5 py-2.5 font-mono text-[11px] text-warn">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>.clar files supported directly</strong> — both <code>assembly.xml</code> and <code>assembly-diagram.xml</code> are extracted automatically.
            </span>
          </div>
          {err && <p className="font-mono text-[11px] text-danger">Analysis error: {err}</p>}
          <Button size="lg" disabled={!studentFile} onClick={run}>
            <ScanLine className="h-4 w-4" /> Analyse &amp; Grade
          </Button>
        </CardBody>
      </Card>
      <RubricEditor />
    </div>
  );
}
