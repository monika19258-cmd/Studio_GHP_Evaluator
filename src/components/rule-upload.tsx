"use client";

import * as React from "react";
import { FileText, FileCheck2, Loader2, Wand2 } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody, CardTag } from "@/components/ui/card";
import { FileDrop } from "@/components/file-drop";
import { Button } from "@/components/ui/button";
import { readFile } from "@/lib/parsing/file-readers";
import { parseRulesToRubric, mergeWithDefaults } from "@/lib/rubric/rule-parser";

/**
 * Step: upload reference rule documents + reference/answer-key CLAR.
 * Rule docs are parsed into an editable rubric (replacing the hardcoded one);
 * the reference CLAR text is stored for gap-analysis against students.
 */
export function RuleUpload() {
  const { setRubric, resetRubric, setReferenceText, setRulesText, referenceText } = useEvaluatorStore();
  const [ruleNames, setRuleNames] = React.useState<string[]>([]);
  const [refName, setRefName] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"rules" | "ref" | null>(null);
  const [mergeMode, setMergeMode] = React.useState(true);

  async function onRuleDocs(files: FileList) {
    setBusy("rules");
    try {
      const texts: string[] = [];
      const names: string[] = [];
      for (const f of Array.from(files)) {
        texts.push(await readFile(f));
        names.push(f.name);
      }
      setRulesText(texts);
      setRuleNames(names);
      const parsed = parseRulesToRubric(texts, names.join(", "));
      setRubric(mergeMode ? mergeWithDefaults(parsed) : parsed);
    } finally {
      setBusy(null);
    }
  }

  async function onReference(files: FileList) {
    setBusy("ref");
    try {
      const f = files[0];
      setReferenceText(await readFile(f));
      setRefName(f.name);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Wand2 className="h-4 w-4 text-text-2" />
        <CardTitle>Rules &amp; Reference (rule-driven evaluation)</CardTitle>
        <CardTag>optional</CardTag>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FileDrop
            label="Reference Rule Document(s)"
            sublabel=".docx .pdf .md .txt — parsed into rubric"
            accept=".txt,.md,.doc,.docx,.pdf"
            multiple
            loadedName={ruleNames.length ? `${ruleNames.length} doc(s): ${ruleNames.join(", ")}` : busy === "rules" ? "Parsing…" : null}
            onFiles={onRuleDocs}
          />
          <FileDrop
            label="Reference / Answer-Key CLAR"
            sublabel=".clar .xml .zip — used for gap analysis"
            accept=".txt,.xml,.clar,.zip,.json,.doc,.docx,.pdf"
            loadedName={refName || (busy === "ref" ? "Reading…" : referenceText ? "loaded" : null)}
            onFiles={onReference}
          />
        </div>

        <label className="flex items-center gap-2 font-mono text-[11px] text-text-2">
          <input type="checkbox" checked={mergeMode} onChange={(e) => setMergeMode(e.target.checked)} className="accent-[hsl(var(--accent))]" />
          Merge parsed rules with the default 10-point rubric (uncheck to use parsed rules only)
        </label>

        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetRubric();
              setRuleNames([]);
            }}
          >
            <FileText className="h-3.5 w-3.5" /> Use default rubric
          </Button>
          {referenceText && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-accent">
              <FileCheck2 className="h-3.5 w-3.5" /> Reference CLAR loaded — gap analysis enabled
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
