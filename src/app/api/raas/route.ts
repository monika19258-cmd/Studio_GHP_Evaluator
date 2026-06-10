/**
 * ──────────────────────────────────────────────────────────────────────────
 *  POST /api/raas — Workday RAAS user-activity fetch (SERVER-ONLY)
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
import type { RaaSResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s on Vercel (default is ~10s, which can kill a slow RAAS call).
export const maxDuration = 60;

function json(body: RaaSResponse, status: number) {
  return NextResponse.json(body, { status });
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
  const { fieldMap: reqFieldMap, format: forcedFormat } = parsed.data;

  // 2. Resolve the RAAS URL: request body first, then server env (RAAS_URL).
  const baseUrl = parsed.data.url ?? process.env.RAAS_URL;
  if (!baseUrl) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "No RAAS report URL configured. Set RAAS_URL in .env.local (server side)." }, 400);
  }
  if (!baseUrl.startsWith("https://")) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "Configured RAAS_URL must use https://." }, 400);
  }
  // Rewrite the report's date window from the UI-selected From/To dates
  // (start-of-day → end-of-day), keeping the URL's existing timezone offset.
  const url = applyDateRange(baseUrl, parsed.data.fromDate, parsed.data.toDate, process.env.RAAS_TZ_OFFSET);

  // 3. Resolve credentials: request body first, then server env fallback.
  const username = parsed.data.username ?? process.env.RAAS_USERNAME;
  const password = parsed.data.password ?? process.env.RAAS_PASSWORD;
  if (!username || !password) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "Missing ISU credentials. Set RAAS_USERNAME / RAAS_PASSWORD in .env.local (server side)." }, 401);
  }

  // 4. Optional allow-list (defense in depth).
  const allowedPrefix = process.env.RAAS_ALLOWED_URL_PREFIX;
  if (allowedPrefix && !url.startsWith(allowedPrefix)) {
    return json({ ok: false, rows: [], count: 0, format: "json", error: "RAAS URL is not in the configured allow-list." }, 403);
  }

  // 5. Build Basic auth header in-memory (never logged).
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  // 6. Call Workday. Default to JSON output unless XML is forced or the URL already specifies a format.
  let target = url;
  if (!/[?&]format=/i.test(target) && !forcedFormat) target += (target.includes("?") ? "&" : "?") + "format=json";
  if (forcedFormat && !/[?&]format=/i.test(target)) target += (target.includes("?") ? "&" : "?") + `format=${forcedFormat}`;

  // Read both the response AND its body within one timeout window. Reading the
  // body outside the try would let a slow stream abort uncaught (→ 500); here a
  // timeout anywhere becomes a clean 502.
  let bodyText = "";
  let contentType = "";
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/json, text/xml;q=0.9, */*;q=0.5" },
      cache: "no-store",
      // Stay just under maxDuration so our handler returns a clean 502 before
      // the platform kills the function (Vercel caps function duration).
      signal: AbortSignal.timeout(55_000),
    });
    // 7. Handle auth/HTTP failures gracefully (no credential echo).
    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, rows: [], count: 0, format: "json", error: "Authentication failed — check the ISU username/password and that the ISU has access to this report." }, 401);
    }
    if (!res.ok) {
      return json({ ok: false, rows: [], count: 0, format: "json", error: `Workday returned HTTP ${res.status}.` }, 502);
    }
    contentType = res.headers.get("content-type") || "";
    bodyText = await res.text();
  } catch (e) {
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const msg = isTimeout
      ? "Workday RAAS request timed out — the report took too long to generate. Try a narrower date range."
      : "Could not reach the Workday RAAS endpoint.";
    return json({ ok: false, rows: [], count: 0, format: "json", error: msg }, 502);
  }

  // 8. Parse JSON or XML.
  const isXml = forcedFormat === "xml" || (!forcedFormat && (contentType.includes("xml") || bodyText.trimStart().startsWith("<")));
  const fieldMap = reqFieldMap ?? DEFAULT_FIELD_MAP;

  let rowsRaw: Record<string, unknown>[] = [];
  try {
    if (isXml) {
      const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: true });
      rowsRaw = extractReportRows(xml.parse(bodyText));
    } else {
      rowsRaw = extractReportRows(JSON.parse(bodyText));
    }
  } catch {
    return json({ ok: false, rows: [], count: 0, format: isXml ? "xml" : "json", error: "Could not parse the RAAS report body." }, 502);
  }

  const rows = normalizeRows(rowsRaw, fieldMap);
  return json({ ok: true, rows, count: rows.length, format: isXml ? "xml" : "json" }, 200);
}
