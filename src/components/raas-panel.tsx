"use client";

import * as React from "react";
import { Activity, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useEvaluatorStore } from "@/store/use-evaluator-store";
import { Card, CardHeader, CardTitle, CardBody, CardTag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RaaSResponse } from "@/lib/types";

/**
 * Workday RAAS user-activity panel.
 *
 * Config (RAAS URL + ISU username/password) is read SERVER-SIDE from
 * .env.local — RAAS_URL / RAAS_USERNAME / RAAS_PASSWORD. The browser never sees
 * the credentials or the URL; this panel just triggers the server-side fetch
 * with an empty body. There is nothing to type here.
 */
export function RaasPanel() {
  const setRaasRows = useEvaluatorStore((s) => s.setRaasRows);
  const raasRows = useEvaluatorStore((s) => s.raasRows);
  const students = useEvaluatorStore((s) => s.students);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const matched = students.filter((s) => s.raas).length;

  async function fetchActivity() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      // Empty body: the server resolves URL + credentials from env.
      const res = await fetch("/api/raas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: RaaSResponse = await res.json();
      if (!data.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setRaasRows(data.rows);
      if (data.count === 0) setInfo("Report returned no rows. Check the report filter/prompt in Workday.");
      else setInfo(`Fetched ${data.count} activity row${data.count === 1 ? "" : "s"} (${data.format.toUpperCase()}).`);
    } catch {
      setError("Network error calling the backend route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Activity className="h-4 w-4 text-text-2" />
        <CardTitle>Workday RAAS — User Activity</CardTitle>
        {raasRows.length > 0 && <CardTag>{matched}/{students.length} matched</CardTag>}
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn/10 px-3.5 py-2.5 font-mono text-[11px] text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            The report URL and ISU credentials are read server-side from{" "}
            <code>RAAS_URL</code>, <code>RAAS_USERNAME</code> and <code>RAAS_PASSWORD</code> in{" "}
            <code>.env.local</code>. They are used only to call Workday in-memory and are never sent to the browser, logged, or stored.
          </span>
        </div>

        <Button onClick={fetchActivity} disabled={loading} size="lg">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          {loading ? "Fetching…" : "Fetch User Activity"}
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/10 px-3.5 py-2.5 font-mono text-[11px] text-danger">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {info && !error && (
          <div className="flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 px-3.5 py-2.5 font-mono text-[11px] text-accent">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{info}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
