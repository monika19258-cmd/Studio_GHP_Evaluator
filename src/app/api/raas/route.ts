/**
 * ──────────────────────────────────────────────────────────────────────────
 *  POST /api/raas — Workday RAAS user-activity fetch (SERVER-ONLY)
 *
 *  Multi-tenant: when RAAS_URL_2 is set the route fetches both tenants in
 *  parallel and merges the rows. Each row is stamped with a `tenant` label
 *  (e.g. "DPT3", "DPT10") derived from the URL's customreport2 tenant slug.
 *
 *  Security posture:
 *   • Credentials arrive in the request body OR fall back to env vars.
 *   • They live ONLY in memory for the duration of the request. They are never
 *     logged, never written to disk, and never returned to the client.
 *   • The Basic-auth header is built locally and sent only to the Workday URL.
 *   • Optional RAAS_ALLOWED_URL_PREFIX prevents this route being used as an open
 *     proxy to arbitrary hosts.
 *   • Calling Workday from the server (not the browser) avoids CORS and keeps
 *     the ISU password off the client entirely.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { DEFAULT_FIELD_MAP, applyDateRange, extractReportRows, normalizeRows, raasRequestSchema } from "@/lib/raas/schema";
import type { RaaSActivity, RaaSFieldMap, RaaSResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s on Vercel (default is ~10s, which can kill a slow RAAS call).
export const maxDuration = 60;

function json(body: RaaSResponse, status: number) {
  return NextResponse.json(body, { status });
}

/** Derive a short label from the Workday tenant slug in the URL (e.g. "DPT3", "DPT10"). */
function tenantLabel(url: string): string {
  const m = url.match(/\/customreport2\/([^/]+)\//);
  if (!m) return "default";
  const slug = m[1].toLowerCase();
  const dpt = slug.match(/dpt(\d+)/);
  return dpt ? `DPT${dpt[1]}` : m[1];
}

interface TenantConfig {
  url: string;
  username: string;
  password: string;
  label: string;
}

/** Fetch rows from one Workday RAAS tenant, tagging each row with the tenant label. */
async function fetchTenantRows(
  cfg: TenantConfig,
  fromDate: string | undefined,
  toDate: string | undefined,
  fieldMap: RaaSFieldMap,
  forcedFormat: "json" | "xml" | undefined,
  tzOffset: string | undefined,
  allowedPrefix: string | undefined,
): Promise<{ rows: RaaSActivity[]; error?: string }> {
  const url = applyDateRange(cfg.url, fromDate, toDate, tzOffset);

  if (allowedPrefix && !url.startsWith(allowedPrefix)) {
    return { rows: [], error: `${cfg.label}: URL is not in the configured allow-list.` };
  }

  let target = url;
  if (!/[?&]format=/i.test(target) && !forcedFormat) target += (target.includes("?") ? "&" : "?") + "format=json";
  if (forcedFormat && !/[?&]format=/i.test(target)) target += (target.includes("?") ? "&" : "?") + `format=${forcedFormat}`;

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
      return { rows: [], error: `${cfg.label}: Authentication failed — check the ISU username/password and report access.` };
    }
    if (!res.ok) {
      return { rows: [], error: `${cfg.label}: Workday returned HTTP ${res.status}.` };
    }
    contentType = res.headers.get("content-type") || "";
    bodyText = await res.text();
  } catch (e) {
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      rows: [],
      error: isTimeout
        ? `${cfg.label}: RAAS request timed out — the report took too long. Try a narrower date range.`
        : `${cfg.label}: Could not reach the Workday RAAS endpoint.`,
    };
  }

  const isXml = forcedFormat === "xml" || (!forcedFormat && (contentType.includes("xml") || bodyText.trimStart().startsWith("<")));
  let rowsRaw: Record<string, unknown>[] = [];
  try {
    if (isXml) {
      const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: true });
      rowsRaw = extractReportRows(xml.parse(bodyText));
    } else {
      rowsRaw = extractReportRows(JSON.parse(bodyText));
    }
  } catch {
    return { rows: [], error: `${cfg.label}: Could not parse the RAAS report body.` };
  }

  return { rows: normalizeRows(rowsRaw, fieldMap, cfg.label) };
}

export async function POST(req: NextRequest) {
  // 1. Validate input. The body may be empty ({}) — all config can come from env.
  let parsedBody: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length) parsedBody = JSON.parse(text);
  } catch {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "Invalid JSON body" }, 400);
  }

  const parsed = raasRequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: parsed.error.issues.map((i) => i.message).join("; ") }, 400);
  }
  const { fieldMap: reqFieldMap, format: forcedFormat, fromDate, toDate } = parsed.data;
  const fieldMap = reqFieldMap ?? DEFAULT_FIELD_MAP;
  const allowedPrefix = process.env.RAAS_ALLOWED_URL_PREFIX;

  // 2. Resolve the primary tenant (required).
  const primaryUrl = parsed.data.url ?? process.env.RAAS_URL;
  if (!primaryUrl) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "No RAAS report URL configured. Set RAAS_URL in .env.local (server side)." }, 400);
  }
  if (!primaryUrl.startsWith("https://")) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "Configured RAAS_URL must use https://." }, 400);
  }
  const primaryUsername = parsed.data.username ?? process.env.RAAS_USERNAME;
  const primaryPassword = parsed.data.password ?? process.env.RAAS_PASSWORD;
  if (!primaryUsername || !primaryPassword) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "Missing ISU credentials. Set RAAS_USERNAME / RAAS_PASSWORD in .env.local (server side)." }, 401);
  }

  const configs: TenantConfig[] = [
    { url: primaryUrl, username: primaryUsername, password: primaryPassword, label: tenantLabel(primaryUrl) },
  ];

  // 3. Optional second tenant (e.g. DPT10). Credentials fall back to the primary creds when not separately configured.
  const secondaryUrl = process.env.RAAS_URL_2;
  if (secondaryUrl) {
    if (!secondaryUrl.startsWith("https://")) {
      return json({ ok: false, rows: [], count: 0, format: "json", error: "RAAS_URL_2 must use https://." }, 400);
    }
    configs.push({
      url: secondaryUrl,
      username: process.env.RAAS_USERNAME_2 || primaryUsername,
      password: process.env.RAAS_PASSWORD_2 || primaryPassword,
      label: tenantLabel(secondaryUrl),
    });
  }

  // 4. Fetch all configured tenants in parallel.
  const results = await Promise.all(
    configs.map((cfg) => fetchTenantRows(cfg, fromDate, toDate, fieldMap, forcedFormat, process.env.RAAS_TZ_OFFSET, allowedPrefix))
  );

  // 5. Merge rows; collect non-fatal warnings from tenants that partially failed.
  const allRows: RaaSActivity[] = [];
  const warnings: string[] = [];
  for (const r of results) {
    allRows.push(...r.rows);
    if (r.error) warnings.push(r.error);
  }

  // If every tenant failed, surface a hard error rather than an empty success.
  if (allRows.length === 0 && warnings.length === configs.length) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: warnings.join(" | ") }, 502);
  }

  return json({
    ok: true,
    rows: allRows,
    count: allRows.length,
    format: "json",
    ...(warnings.length ? { warnings } : {}),
  }, 200);
}
