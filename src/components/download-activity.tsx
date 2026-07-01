"use client";

import * as React from "react";
import { DownloadCloud, ShieldAlert, FileWarning, Download } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody, CardTag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { DownloadEvent } from "@/lib/types";

/** CSV of the detected download/copy events. */
function buildDownloadCsv(events: DownloadEvent[]): string {
  const header = ["Downloader", "Username", "Target CLAR", "Task", "Activity Category", "Request Time", "IP Address", "Tenant", "Cross-Account"];
  const rows = events.map((e) =>
    [e.downloader, e.username ?? "", e.target ?? "", e.task ?? "", e.activityCategory ?? "", e.requestTime ?? "", e.ipAddress ?? "", e.tenant ?? "", e.crossAccount ? "yes" : "no"]
      .map((c) => '"' + String(c).replace(/"/g, '""') + '"')
      .join(",")
  );
  return [header.map((c) => '"' + c + '"').join(","), ...rows].join("\n");
}

/**
 * Studio-CLAR download tracker. Lists every "View Cloud Collection (Studio
 * Project)" + DOWNLOAD event from the activity report so the grader can spot
 * trainees who downloaded/copied another trainee's CLAR. Rows where the
 * downloaded target doesn't appear to belong to the downloader are highlighted.
 */
export function DownloadActivity() {
  const raasRows = useEvaluatorStore((s) => s.raasRows);
  const events = useEvaluatorStore((s) => s.downloadEvents);

  // Nothing to show until a report has been fetched.
  if (raasRows.length === 0) return null;

  const flagged = events.filter((e) => e.crossAccount).length;

  return (
    <Card>
      <CardHeader>
        <DownloadCloud className="h-4 w-4 text-text-2" />
        <CardTitle>Studio CLAR Downloads — Copy Detection</CardTitle>
        <CardTag>{events.length} download{events.length === 1 ? "" : "s"}</CardTag>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn/10 px-3.5 py-2.5 font-mono text-[11px] text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Every <code>Activity Category = DOWNLOAD</code> + <code>Task = View Cloud Collection (Studio Project)</code> event is
            listed below. Rows flagged <strong>cross-account</strong> are where the downloaded CLAR does not appear to belong to the
            downloader — the likely-copying cases to review.
          </span>
        </div>

        {events.length === 0 ? (
          <p className="font-mono text-[11px] text-text-3">
            No Studio-project download activity found in the fetched report. (Checked {raasRows.length} activity row{raasRows.length === 1 ? "" : "s"}.)
          </p>
        ) : (
          <>
            {flagged > 0 && (
              <div className="flex items-center gap-2 font-mono text-[11px] text-danger">
                <FileWarning className="h-4 w-4 flex-shrink-0" />
                <span>{flagged} cross-account download{flagged === 1 ? "" : "s"} flagged for review.</span>
              </div>
            )}
            <Table className="min-w-[820px]">
              <THead>
                <tr>
                  <TH className="text-left">Downloader</TH>
                  <TH className="text-left">Target CLAR</TH>
                  <TH>Request Time</TH>
                  <TH>IP Address</TH>
                  <TH>Tenant</TH>
                  <TH>Flag</TH>
                </tr>
              </THead>
              <TBody>
                {events.map((e, i) => (
                  <tr key={i} className={cn("hover:[&>td]:brightness-110", e.crossAccount && "bg-danger/5")}>
                    <TD className="whitespace-nowrap text-left font-semibold text-text">{e.downloader}</TD>
                    <TD className="text-left text-text-2" title={e.task ?? undefined}>{e.target ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-text-3">{e.requestTime ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-text-3">{e.ipAddress ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-text-3">{e.tenant ?? "—"}</TD>
                    <TD>
                      {e.crossAccount ? (
                        <span className="inline-block rounded-sm bg-danger/15 px-2 py-1 text-[10px] font-semibold text-danger">cross-account</span>
                      ) : (
                        <span className="inline-block rounded-sm bg-surface-3 px-2 py-1 text-[10px] text-text-3">own</span>
                      )}
                    </TD>
                  </tr>
                ))}
              </TBody>
            </Table>

            <Button variant="secondary" size="lg" className="no-print" onClick={() => downloadCsv(buildDownloadCsv(events), "clar_download_activity.csv")}>
              <Download className="h-4 w-4" /> Export Download Log (CSV)
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
