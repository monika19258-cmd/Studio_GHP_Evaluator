/**
 * ──────────────────────────────────────────────────────────────────────────
 *  POST /api/raas/integration — Integration→ISU attachment lookup (SERVER-ONLY)
 *
 *  Body: { integrationName: string }  (taken from the CLAR file name)
 *
 *  Reads the Integration-System RAAS report (RAAS_INTEGRATION_URL) prompted
 *  with the integration name, using the same ISU credentials as the activity
 *  report. Returns whether the integration is tagged to an ISU (Workday_Account).
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

  // 2. Resolve config from env.
  const baseUrl = process.env.RAAS_INTEGRATION_URL;
  if (!baseUrl) return fail("Integration ISU report not configured (set RAAS_INTEGRATION_URL).", 501);
  if (!baseUrl.startsWith("https://")) return fail("RAAS_INTEGRATION_URL must use https://.", 400);

  // The integration report may use its own ISU; fall back to the shared one.
  const username = process.env.RAAS_INTEGRATION_USERNAME || process.env.RAAS_USERNAME;
  const password = process.env.RAAS_INTEGRATION_PASSWORD || process.env.RAAS_PASSWORD;
  if (!username || !password) return fail("Missing ISU credentials (set RAAS_INTEGRATION_USERNAME / RAAS_INTEGRATION_PASSWORD, or RAAS_USERNAME / RAAS_PASSWORD).", 401);

  const allowedPrefix = process.env.RAAS_ALLOWED_URL_PREFIX;
  if (allowedPrefix && !baseUrl.startsWith(allowedPrefix)) return fail("RAAS_INTEGRATION_URL is not in the configured allow-list.", 403);

  // 3. Inject the integration name as the report prompt and default to JSON.
  let target = buildIntegrationUrl(baseUrl, integrationName, process.env.RAAS_INTEGRATION_PARAM);
  if (!/[?&]format=/i.test(target)) target += (target.includes("?") ? "&" : "?") + "format=json";

  // 4. Call Workday (Basic auth, in-memory). Read the body within the same
  // timeout window so a slow stream becomes a clean 502, not an uncaught 500.
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  let bodyText = "";
  let contentType = "";
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/json, text/xml;q=0.9, */*;q=0.5" },
      cache: "no-store",
      // Stay just under maxDuration so our handler returns a clean 502 before
      // the platform kills the function.
      signal: AbortSignal.timeout(55_000),
    });
    if (res.status === 401 || res.status === 403) return fail("Authentication failed — check the ISU credentials and report access.", 401);
    if (!res.ok) return fail(`Workday returned HTTP ${res.status}.`, 502);
    contentType = res.headers.get("content-type") || "";
    bodyText = await res.text();
  } catch (e) {
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return fail(isTimeout ? "Integration RAAS request timed out (the report took too long)." : "Could not reach the integration RAAS endpoint.", 502);
  }

  // 5. Parse JSON or XML.
  const isXml = contentType.includes("xml") || bodyText.trimStart().startsWith("<");
  let parsedReport: unknown;
  try {
    parsedReport = isXml
      ? new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: true }).parse(bodyText)
      : JSON.parse(bodyText);
  } catch {
    return json({ ok: false, attached: false, workdayAccount: null, format: isXml ? "xml" : "json", error: "Could not parse the integration report body." }, 502);
  }

  // 6. Extract the attachment.
  const att = extractIsuAttachment(parsedReport, integrationName);
  return json(
    {
      ok: true,
      attached: att.attached,
      workdayAccount: att.workdayAccount,
      integrationSystem: att.integrationSystem,
      systemName: att.systemName,
      referenceId: att.referenceId,
      format: isXml ? "xml" : "json",
    },
    200
  );
}
