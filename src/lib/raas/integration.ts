/**
 * Integration-System RAAS report → ISU attachment.
 *
 * The report is prompted with an integration name (taken from the CLAR file
 * name) and returns whether that integration is tagged to an ISU. Example row:
 *   {
 *     "Integration_System": "Int_Studio_Transformations",
 *     "System_Name":        "Int_Studio_Transformations",
 *     "Workday_Account":    "test isu",
 *     "referenceID":        "Int_Studio_Transformations/.../StartHere"
 *   }
 * "Attached" means a non-empty Workday_Account is present.
 */
import { extractReportRows, findByAliases, removeParam, setParam } from "./schema";
import type { IsuAttachment } from "@/lib/types";

const WORKDAY_ACCOUNT_ALIASES = ["Workday_Account", "Workday Account", "workdayAccount", "ISU", "Integration_System_User"];
const INTEGRATION_SYSTEM_ALIASES = ["Integration_System", "Integration System", "integrationSystem"];
const SYSTEM_NAME_ALIASES = ["System_Name", "System Name", "systemName"];
const REFERENCE_ID_ALIASES = ["referenceID", "Reference_ID", "referenceId", "reference_id"];

/**
 * Build the integration report URL by injecting the integration name. Prefers a
 * `{integration}` placeholder in the URL; otherwise sets the configured prompt
 * parameter; otherwise appends a sensible default param.
 */
export function buildIntegrationUrl(baseUrl: string, integrationName: string, promptParam?: string): string {
  const enc = encodeURIComponent(integrationName);
  if (baseUrl.includes("{integration}")) return baseUrl.replace(/\{integration\}/g, enc);
  if (promptParam) return setParam(baseUrl, promptParam, enc);
  return baseUrl + (baseUrl.includes("?") ? "&" : "?") + "Integration_System_Name=" + enc;
}

/**
 * Build a "broad" URL that fetches ALL integrations (no prompt filter).
 * Used as a fallback when the exact-name prompt returns 0 rows — the caller
 * then fuzzy-matches locally against the full list.
 */
export function buildBroadUrl(baseUrl: string, promptParam?: string): string {
  // Remove the {integration} placeholder parameter (the whole ?key={integration} pair).
  if (baseUrl.includes("{integration}")) {
    const idx = baseUrl.indexOf("?");
    if (idx === -1) return baseUrl;
    const base = baseUrl.slice(0, idx);
    const pairs = baseUrl.slice(idx + 1).split("&").filter((p) => !p.includes("{integration}"));
    return pairs.length ? `${base}?${pairs.join("&")}` : base;
  }
  // Remove the named prompt parameter.
  const key = promptParam ?? "System_Name";
  return removeParam(baseUrl, key);
}

/**
 * Normalize a name for fuzzy matching: lowercase, alphanumeric characters only.
 * "Mahesh_Reddy_Studio_X" and "MaheshReddy_Studio_X" both become
 * "maheshreddystudiox" and will match each other.
 */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pull the ISU attachment out of a parsed report body for one integration name.
 * Uses the first report row (the report is prompted to a single integration).
 */
export function extractIsuAttachment(parsed: unknown, integrationName: string): Omit<IsuAttachment, "checked" | "error"> {
  const rows = extractReportRows(parsed);
  if (rows.length === 0) {
    return { integrationName, attached: false, workdayAccount: null };
  }
  const row = rows[0];
  const workdayAccountRaw = findByAliases(row, WORKDAY_ACCOUNT_ALIASES);
  const workdayAccount = workdayAccountRaw && workdayAccountRaw.trim().length ? workdayAccountRaw.trim() : null;
  return {
    integrationName,
    attached: workdayAccount !== null,
    workdayAccount,
    integrationSystem: findByAliases(row, INTEGRATION_SYSTEM_ALIASES),
    systemName: findByAliases(row, SYSTEM_NAME_ALIASES),
    referenceId: findByAliases(row, REFERENCE_ID_ALIASES),
  };
}

/**
 * Search across ALL rows in an unfiltered report and find the one whose
 * System_Name matches `integrationName` after normalization (ignoring
 * underscores, spaces, hyphens, and case differences).
 *
 * Used as a fallback when the exact-prompt fetch returns 0 rows — e.g. when
 * the CLAR filename uses underscores between name parts ("Mahesh_Reddy_…")
 * but the Workday integration is camel-cased ("MaheshReddy_…").
 */
export function fuzzyExtractIsuAttachment(parsed: unknown, integrationName: string): Omit<IsuAttachment, "checked" | "error"> {
  const rows = extractReportRows(parsed);
  if (rows.length === 0) return { integrationName, attached: false, workdayAccount: null };

  const target = normalizeName(integrationName);
  const matchedRow = rows.find((row) => {
    const sysName = findByAliases(row, SYSTEM_NAME_ALIASES);
    return sysName ? normalizeName(sysName) === target : false;
  });
  if (!matchedRow) return { integrationName, attached: false, workdayAccount: null };

  const workdayAccountRaw = findByAliases(matchedRow, WORKDAY_ACCOUNT_ALIASES);
  const workdayAccount = workdayAccountRaw && workdayAccountRaw.trim().length ? workdayAccountRaw.trim() : null;
  return {
    integrationName,
    attached: workdayAccount !== null,
    workdayAccount,
    integrationSystem: findByAliases(matchedRow, INTEGRATION_SYSTEM_ALIASES),
    systemName: findByAliases(matchedRow, SYSTEM_NAME_ALIASES),
    referenceId: findByAliases(matchedRow, REFERENCE_ID_ALIASES),
  };
}
