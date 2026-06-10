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
import { extractReportRows, findByAliases, setParam } from "./schema";
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
