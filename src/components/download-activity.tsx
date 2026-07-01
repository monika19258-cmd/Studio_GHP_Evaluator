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

/** One tenant's download event table. */
function TenantDownloadTable({ events, tenant }: { events: DownloadEvent[]; tenant?: string }) {
  const flagged = events.filter((e) => e.crossAccount).length;
  const label = tenant ?? "Activity";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-sm bg-accent/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">{label}</span>
        <span className="font-mono text-[11px] text-text-3">{events.length} download{events.length === 1 ? "" : "s"}</span>
        {flagged > 0 && (
          <span className="flex items-center gap-1 font-mono text-[11px] text-danger">
            <FileWarning className="h-3.5 w-3.5" /> {flagged} cross-account
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="font-mono text-[11px] text-text-3 pl-1">No Studio-project download events found in this tenant.</p>
      ) : (
        <>
          <Table className="min-w-[760px]">
            <THead>
              <tr>
                <TH className="text-left">Downloader</TH>
                <TH className="text-left">Target CLAR</TH>
                <TH>Request Time</TH>
                <TH>IP Address</TH>
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
          <Button variant="secondary" size="lg" className="no-print"
            onClick={() => downloadCsv(buildDownloadCsv(events), `clar_download_activity_${label.toLowerCase()}.csv`)}>
            <Download className="h-4 w-4" /> Export {label} Log (CSV)
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Studio-CLAR download tracker. Lists every "View Cloud Collection (Studio
 * Project)" + DOWNLOAD event from the activity report so the grader can spot
 * trainees who downloaded/copied another trainee's CLAR. When multiple tenants
 * are configured (e.g. DPT3 + DPT10), each tenant's events appear in its own
 * labelled table section.
 */
export function DownloadActivity() {
  const raasRows = useEvaluatorStore((s) => s.raasRows);
  const events = useEvaluatorStore((s) => s.downloadEvents);

  // Nothing to show until a report has been fetched.
  if (raasRows.length === 0) return null;

  // Determine which tenants are represented across all activity rows (not just downloads),
  // so we can show a section for every configured tenant even if it had 0 downloads.
  const activeTenants = [...new Set(raasRows.map((r) => r.tenant).filter(Boolean))] as string[];
  const multiTenant = activeTenants.length > 1;

  const totalFlagged = events.filter((e) => e.crossAccount).length;

  return (
    <Card>
      <CardHeader>
        <DownloadCloud className="h-4 w-4 text-text-2" />
        <CardTitle>Studio CLAR Downloads — Copy Detection</CardTitle>
        <CardTag>{events.length} download{events.length === 1 ? "" : "s"}</CardTag>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn/10 px-3.5 py-2.5 font-mono text-[11px] text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Every <code>Activity Category = DOWNLOAD</code> + <code>Task = View Cloud Collection (Studio Project)</code> event is
            listed below. Rows flagged <strong>cross-account</strong> are where the downloaded CLAR does not appear to belong to the
            downloader — the likely-copying cases to review.
          </span>
        </div>

        {multiTenant ? (
          // ── Multi-tenant: one section per tenant ───────────────────────────
          <>
            {totalFlagged > 0 && (
              <div className="flex items-center gap-2 font-mono text-[11px] text-danger">
                <FileWarning className="h-4 w-4 flex-shrink-0" />
                <span>{totalFlagged} cross-account download{totalFlagged === 1 ? "" : "s"} flagged for review (across all tenants).</span>
              </div>
            )}
            <div className="space-y-6">
              {activeTenants.map((tenant) => (
                <TenantDownloadTable
                  key={tenant}
                  tenant={tenant}
                  events={events.filter((e) => e.tenant === tenant)}
                />
              ))}
            </div>
            {events.length > 0 && (
              <Button variant="secondary" size="lg" className="no-print"
                onClick={() => downloadCsv(buildDownloadCsv(events), "clar_download_activity_all.csv")}>
                <Download className="h-4 w-4" /> Export Combined Log (CSV)
              </Button>
            )}
          </>
        ) : (
          // ── Single tenant: original single-table view ──────────────────────
          events.length === 0 ? (
            <p className="font-mono text-[11px] text-text-3">
              No Studio-project download activity found in the fetched report. (Checked {raasRows.length} activity row{raasRows.length === 1 ? "" : "s"}.)
            </p>
          ) : (
            <>
              {totalFlagged > 0 && (
                <div className="flex items-center gap-2 font-mono text-[11px] text-danger">
                  <FileWarning className="h-4 w-4 flex-shrink-0" />
                  <span>{totalFlagged} cross-account download{totalFlagged === 1 ? "" : "s"} flagged for review.</span>
                </div>
              )}
              <Table className="min-w-[760px]">
                <THead>
                  <tr>
                    <TH className="text-left">Downloader</TH>
                    <TH className="text-left">Target CLAR</TH>
                    <TH>Request Time</TH>
                    <TH>IP Address</TH>
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
              <Button variant="secondary" size="lg" className="no-print"
                onClick={() => downloadCsv(buildDownloadCsv(events), "clar_download_activity.csv")}>
                <Download className="h-4 w-4" /> Export Download Log (CSV)
              </Button>
            </>
          )
        )}
      </CardBody>
    </Card>
  );
}
