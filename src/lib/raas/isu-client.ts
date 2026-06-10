/**
 * Client helper: look up whether a CLAR's integration is attached to an ISU
 * via the server route. Returns an IsuAttachment (checked=false on error), or
 * null when the feature isn't configured (RAAS_INTEGRATION_URL unset) so the
 * caller can silently skip it and leave the ISU criterion as manual.
 */
import type { IsuAttachment, RaaSIntegrationResponse } from "@/lib/types";

export async function lookupIsuAttachment(integrationName: string): Promise<IsuAttachment | null> {
  try {
    const res = await fetch("/api/raas/integration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationName }),
    });
    // 501 = feature not configured on the server → skip silently.
    if (res.status === 501) return null;
    const data: RaaSIntegrationResponse = await res.json();
    if (!data.ok) {
      return { integrationName, checked: false, attached: false, workdayAccount: null, error: data.error || "Lookup failed" };
    }
    return {
      integrationName,
      checked: true,
      attached: data.attached,
      workdayAccount: data.workdayAccount,
      integrationSystem: data.integrationSystem,
      systemName: data.systemName,
      referenceId: data.referenceId,
    };
  } catch {
    return { integrationName, checked: false, attached: false, workdayAccount: null, error: "Network error calling the integration route." };
  }
}
