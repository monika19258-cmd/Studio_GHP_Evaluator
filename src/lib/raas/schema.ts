/**
 * Zod schemas + normalization for the Workday RAAS user-activity feature.
 * Credentials are validated here but NEVER logged or persisted (see route.ts).
 */
import { z } from "zod";
import type { RaaSActivity, RaaSFieldMap } from "@/lib/types";

/** Default Workday-ish field names; the grader can override per report. */
export const DEFAULT_FIELD_MAP: RaaSFieldMap = {
  username: "Username",
  displayName: "Worker",
  signOns: "Successful_Sign_Ons",
  lastActivity: "Last_Activity",
  totalTasks: "Total_Tasks",
};

export const fieldMapSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().min(1),
  signOns: z.string().optional(),
  lastActivity: z.string().optional(),
  totalTasks: z.string().optional(),
});

/**
 * Request body for POST /api/raas.
 * Every field is optional — the UI sends an empty body and the server reads the
 * RAAS URL and ISU credentials from RAAS_URL / RAAS_USERNAME / RAAS_PASSWORD.
 * When a value IS supplied it overrides the env var (used by tests/tooling).
 */
/** A calendar date as "YYYY-MM-DD" (from an <input type="date">). */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be YYYY-MM-DD" });

export const raasRequestSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), { message: "RAAS URL must use https://" })
    .optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  /** Force the parser; otherwise inferred from URL/?format= and Content-Type. */
  format: z.enum(["json", "xml"]).optional(),
  fieldMap: fieldMapSchema.optional(),
  /** Start date — rewrites From_Moment to <date>T00:00:00.000 (start of day). */
  fromDate: dateOnly.optional(),
  /** End date — rewrites To_Moment to <date>T23:59:59.999 (end of day). */
  toDate: dateOnly.optional(),
});

export type RaaSRequest = z.infer<typeof raasRequestSchema>;

/** Extract a timezone offset ("-07:00", "+05:30", "Z") from the END of a string. */
function offsetOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(Z|[+-]\d{2}:\d{2})$/);
  return m ? m[1] : null;
}

/** Set or append a single query param on a raw URL string (keeps colons literal). */
export function setParam(url: string, key: string, value: string): string {
  const re = new RegExp(`([?&]${key}=)[^&]*`);
  if (re.test(url)) return url.replace(re, `$1${value}`);
  return url + (url.includes("?") ? "&" : "?") + `${key}=${value}`;
}

/** Remove a query parameter from a URL by key. */
export function removeParam(url: string, key: string): string {
  const idx = url.indexOf("?");
  if (idx === -1) return url;
  const base = url.slice(0, idx);
  const pairs = url.slice(idx + 1).split("&").filter((p) => !p.startsWith(key + "=") && p !== key);
  return pairs.length ? `${base}?${pairs.join("&")}` : base;
}

/**
 * Apply a user-selected date range to a Workday RAAS URL by rewriting the
 * From_Moment (start of day, 00:00:00.000) and To_Moment (end of day,
 * 23:59:59.999) prompt parameters. `fromDate`/`toDate` are "YYYY-MM-DD".
 *
 * The timezone offset is taken from the URL's existing moments when present,
 * otherwise from `fallbackOffset` (RAAS_TZ_OFFSET, default "-07:00") so the
 * window matches the tenant's local day rather than UTC.
 */
export function applyDateRange(rawUrl: string, fromDate?: string, toDate?: string, fallbackOffset = "-07:00"): string {
  const existing = offsetOf(rawUrl.match(/From_Moment=([^&]*)/)?.[1]) ?? offsetOf(rawUrl.match(/To_Moment=([^&]*)/)?.[1]);
  const offset = existing ?? (/^(Z|[+-]\d{2}:\d{2})$/.test(fallbackOffset) ? fallbackOffset : "-07:00");
  let out = rawUrl;
  if (fromDate) out = setParam(out, "From_Moment", `${fromDate}T00:00:00.000${offset}`);
  if (toDate) out = setParam(out, "To_Moment", `${toDate}T23:59:59.999${offset}`);
  return out;
}

/** Pull report rows out of either a JSON or XML-derived object. */
export function extractReportRows(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // JSON RaaS: { Report_Entry: [...] }
    if (Array.isArray(obj.Report_Entry)) return obj.Report_Entry as Record<string, unknown>[];
    // XML RaaS: { "wd:Report_Data": { "wd:Report_Entry": [...] | {...} } }
    const reportData = (obj["wd:Report_Data"] ?? obj.Report_Data) as Record<string, unknown> | undefined;
    if (reportData) {
      const entries = reportData["wd:Report_Entry"] ?? reportData.Report_Entry;
      if (Array.isArray(entries)) return entries as Record<string, unknown>[];
      if (entries && typeof entries === "object") return [entries as Record<string, unknown>];
    }
  }
  return [];
}

/** Coerce a raw cell (string, number, or XML {#text} object) to a trimmed string. */
function cellToString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"]).trim();
    return undefined;
  }
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/** Read a field by exact name, tolerating the "wd:" namespace prefix and nested {#text}. */
function readField(row: Record<string, unknown>, name?: string): string | undefined {
  if (!name) return undefined;
  const candidates = [name, `wd:${name}`, name.replace(/^wd:/, "")];
  for (const key of candidates) {
    if (key in row) return cellToString(row[key]);
  }
  return undefined;
}

/** Normalize a key for fuzzy comparison: lower-case, drop wd: prefix, strip non-alphanumerics. */
function normKey(s: string): string {
  return s.toLowerCase().replace(/^wd:/, "").replace(/[^a-z0-9]+/g, "");
}

/**
 * Find a field by any of several candidate aliases, comparing keys loosely
 * (case-, space-, underscore- and namespace-insensitive). This lets us read a
 * Workday User Activity report whose column aliases vary ("System_Account",
 * "System Account", "wd:Target", …) without the grader hand-mapping each one.
 */
export function findByAliases(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const wanted = aliases.map(normKey);
  for (const key of Object.keys(row)) {
    if (wanted.includes(normKey(key))) {
      const val = cellToString(row[key]);
      if (val !== undefined) return val;
    }
  }
  return undefined;
}

/**
 * Workday's "System Account" cell is often "username / Display Name"
 * (e.g. "mgupta-trn / Monika Gupta"). Split it into its two halves.
 */
function splitSystemAccount(raw?: string): { username?: string; displayName?: string } {
  if (!raw) return {};
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { username: parts[0], displayName: parts.slice(1).join(" / ") };
  return { username: parts[0] };
}

// Candidate column aliases for each event-level field we care about.
const SYSTEM_ACCOUNT_ALIASES = ["System_Account", "System Account", "systemAccount", "Account"];
const TASK_ALIASES = ["Task", "Task_Name", "Activity_Task"];
const TARGET_ALIASES = ["Target", "Target_Name", "Object", "Business_Object"];
const ACTIVITY_CATEGORY_ALIASES = ["Activity_Category", "Activity Category", "activityCategory", "Category"];
const REQUEST_TIME_ALIASES = ["Request_Time", "Request Time", "requestTime", "Activity_Date", "Timestamp"];
const IP_ALIASES = ["IP_Address", "IP Address", "ipAddress", "Source_IP"];

/** Normalize raw report rows into RaaSActivity objects using the field map. */
export function normalizeRows(rows: Record<string, unknown>[], fieldMap: RaaSFieldMap, tenant?: string): RaaSActivity[] {
  return rows.map((row) => {
    // Event-level fields (User Activity report).
    const systemAccount = findByAliases(row, SYSTEM_ACCOUNT_ALIASES);
    const fromAccount = splitSystemAccount(systemAccount);

    // Prefer the explicit mapped columns; fall back to System Account halves.
    const username = readField(row, fieldMap.username) ?? fromAccount.username;
    const displayName = readField(row, fieldMap.displayName) ?? fromAccount.displayName;

    const signOnsStr = readField(row, fieldMap.signOns);
    const totalTasksStr = readField(row, fieldMap.totalTasks);

    return {
      matchedKey: (displayName || username || "").toLowerCase().trim(),
      username,
      displayName,
      signOns: signOnsStr != null ? Number(signOnsStr) || 0 : undefined,
      lastActivity: readField(row, fieldMap.lastActivity),
      totalTasks: totalTasksStr != null ? Number(totalTasksStr) || 0 : undefined,
      systemAccount,
      task: findByAliases(row, TASK_ALIASES),
      target: findByAliases(row, TARGET_ALIASES),
      activityCategory: findByAliases(row, ACTIVITY_CATEGORY_ALIASES),
      requestTime: findByAliases(row, REQUEST_TIME_ALIASES),
      ipAddress: findByAliases(row, IP_ALIASES),
      tenant,
      raw: row,
    };
  });
}
