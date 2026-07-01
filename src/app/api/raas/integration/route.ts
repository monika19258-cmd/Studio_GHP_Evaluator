/**
 * ──────────────────────────────────────────────────────────────────────────
 *  POST /api/raas/integration — Integration→ISU attachment lookup (SERVER-ONLY)
 *
 *  Body: { integrationName: string }  (taken from the CLAR file name)
 *
 *  Multi-tenant: when RAAS_INTEGRATION_URL_2 is set, both tenants are queried
 *  in parallel. The first tenant that finds the integration attached wins; if
 *  neither finds it, "not attached" is returned.
 *
 *  Same security posture as /api/raas: credentials live only in memory, are
 *  never logged or returned, and the call is made server-side (no CORS).
 * ──────────────────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { buildIntegrationUrl, extractIsuAttachment } from "@/lib/raas/integration";
import type { RaaSIntegrationResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s on Vercel (default is ~10s, which can kill a slow RAAS call).
export const maxDuration = 60;

const bodySchema = z.object({ integrationName: z.string().min(1) });

function json(body: RaaSIntegrationResponse, status: number) {
  return NextResponse.json(body, { status });
}
const fail = (error: string, status: number) => json({ ok: false, attached: false, workdayAccount: null, error }, status);

/** Derive a short tenant label from the Workday URL (e.g. "DPT3", "DPT10"). */
function tenantLabel(url: string): string {
  const m = url.match(/\/customreport2\/([^/]+)\//);
  if (!m) return "default";
  const slug = m[1].toLowerCase();
  const dpt = slug.match(/dpt(\d+)/);
  return dpt ? `DPT${dpt[1]}` : m[1];
}

interface IntegrationTenantConfig {
  url: string;
  username: string;
  password: string;
  promptParam?: string;
  label: string;
}

type TenantResult =
  | { ok: true; attached: boolean; workdayAccount: string | null; integrationSystem?: string; systemName?: string; referenceId?: string; label: string }
  | { ok: false; error: string; label: string };

/** Query one tenant's integration ISU report. Credentials are in-memory only. */
async function queryTenant(cfg: IntegrationTenantConfig, integrationName: string, allowedPrefix?: string): Promise<TenantResult> {
  if (allowedPrefix && !cfg.url.startsWith(allowedPrefix)) {
    return { ok: false, error: `${cfg.label}: URL is not in the configured allow-list.`, label: cfg.label };
  }

  let target = buildIntegrationUrl(cfg.url, integrationName, cfg.promptParam);
  if (!/[?&]format=/i.test(target)) target += (target.includes("?") ? "&" : "?") + "format=json";

  const authHeader = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
  let bodyText = "";
  let contentType = "";
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/json, text/xml;q=0.9, */*;q=0.5" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `${cfg.label}: Authentication failed — check the ISU credentials and report access.`, label: cfg.label };
    }
    if (!res.ok) {
      return { ok: false, error: `${cfg.label}: Workday returned HTTP ${res.status}.`, label: cfg.label };
    }
    contentType = res.headers.get("content-type") || "";
    bodyText = await res.text();
  } catch (e) {
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: isTimeout ? `${cfg.label}: Integration RAAS request timed out.` : `${cfg.label}: Could not reach the integration RAAS endpoint.`,
      label: cfg.label,
    };
  }

  const isXml = contentType.includes("xml") || bodyText.trimStart().startsWith("<");
  let parsedReport: unknown;
  try {
    parsedReport = isXml
      ? new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: true }).parse(bodyText)
      : JSON.parse(bodyText);
  } catch {
    return { ok: false, error: `${cfg.label}: Could not parse the integration report body.`, label: cfg.label };
  }

  const att = extractIsuAttachment(parsedReport, integrationName);
  return { ok: true, attached: att.attached, workdayAccount: att.workdayAccount, integrationSystem: att.integrationSystem, systemName: att.systemName, referenceId: att.referenceId, label: cfg.label };
}

export async function POST(req: NextRequest) {
  // 1. Validate input.
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }
  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) return fail("An integration name is required.", 400);
  const { integrationName } = parsed.data;

  // 2. Build tenant configs. At least RAAS_INTEGRATION_URL must be set.
  const allowedPrefix = process.env.RAAS_ALLOWED_URL_PREFIX;
  const configs: IntegrationTenantConfig[] = [];

  const url1 = process.env.RAAS_INTEGRATION_URL;
  if (url1) {
    if (!url1.startsWith("https://")) return fail("RAAS_INTEGRATION_URL must use https://.", 400);
    const u = process.env.RAAS_INTEGRATION_USERNAME || process.env.RAAS_USERNAME;
    const p = process.env.RAAS_INTEGRATION_PASSWORD || process.env.RAAS_PASSWORD;
    if (u && p) configs.push({ url: url1, username: u, password: p, promptParam: process.env.RAAS_INTEGRATION_PARAM, label: tenantLabel(url1) });
  }

  const url2 = process.env.RAAS_INTEGRATION_URL_2;
  if (url2) {
    if (!url2.startsWith("https://")) return fail("RAAS_INTEGRATION_URL_2 must use https://.", 400);
    // Credentials: _2-specific → shared integration → shared base (in that order).
    const u = process.env.RAAS_INTEGRATION_USERNAME_2 || process.env.RAAS_INTEGRATION_USERNAME || process.env.RAAS_USERNAME;
    const p = process.env.RAAS_INTEGRATION_PASSWORD_2 || process.env.RAAS_INTEGRATION_PASSWORD || process.env.RAAS_PASSWORD;
    if (u && p) configs.push({ url: url2, username: u, password: p, promptParam: process.env.RAAS_INTEGRATION_PARAM_2 || process.env.RAAS_INTEGRATION_PARAM, label: tenantLabel(url2) });
  }

  if (configs.length === 0) return fail("Integration ISU report not configured (set RAAS_INTEGRATION_URL).", 501);

  // 3. Query all configured tenants in parallel.
  const results = await Promise.all(configs.map((cfg) => queryTenant(cfg, integrationName, allowedPrefix)));

  // 4. Return the first tenant that found the integration attached.
  //    If none found it, return the first successful (not-attached) result.
  //    If all failed, return an error.
  const attached = results.find((r): r is Extract<TenantResult, { ok: true }> => r.ok && r.attached);
  if (attached) {
    return json({ ok: true, attached: true, workdayAccount: attached.workdayAccount, integrationSystem: attached.integrationSystem, systemName: attached.systemName, referenceId: attached.referenceId, tenant: attached.label, format: "json" }, 200);
  }

  const notAttached = results.find((r): r is Extract<TenantResult, { ok: true }> => r.ok && !r.attached);
  if (notAttached) {
    return json({ ok: true, attached: false, workdayAccount: null, tenant: notAttached.label, format: "json" }, 200);
  }

  // All tenants errored.
  const errors = results.map((r) => (!r.ok ? r.error : "")).filter(Boolean);
  return fail(errors.join(" | "), 502);
}
