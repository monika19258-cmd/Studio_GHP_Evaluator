"use client";

import * as React from "react";
import { Asterisk, FileCode, Files } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SingleMode } from "@/components/single-mode";
import { BatchMode } from "@/components/batch-mode";
import { useEvaluatorStore } from "@/store/use-evaluator-store";

export default function Home() {
  const [mode, setMode] = React.useState("single");
  const clearAll = useEvaluatorStore((s) => s.clearAll);
  const setStudents = useEvaluatorStore((s) => s.setStudents);

  function switchMode(m: string) {
    // Modes keep independent result sets; clear when switching to avoid cross-mode bleed.
    setStudents([]);
    clearAll();
    setMode(m);
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8">
      <header className="mb-8 border-b border-border pb-5">
        <div className="mb-1.5 flex items-center gap-3.5">
          <div className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[10px] border border-accent/30 bg-accent/10">
            <Asterisk className="h-[22px] w-[22px] text-accent" />
          </div>
          <h1 className="font-mono text-xl font-semibold tracking-tight text-text">CLAR Evaluator — Workday Studio</h1>
        </div>
        <p className="ml-[60px] text-[13px] text-text-2">Rule-driven grading &nbsp;·&nbsp; Single or batch evaluation &nbsp;·&nbsp; Workday RAAS activity verification</p>
      </header>

      <Tabs value={mode} onValueChange={switchMode}>
        <TabsList className="no-print">
          <TabsTrigger value="single">
            <FileCode className="h-4 w-4" /> Single File
          </TabsTrigger>
          <TabsTrigger value="batch">
            <Files className="h-4 w-4" /> Batch / Multi-Student
          </TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <SingleMode />
        </TabsContent>
        <TabsContent value="batch">
          <BatchMode />
        </TabsContent>
      </Tabs>
    </main>
  );
}
