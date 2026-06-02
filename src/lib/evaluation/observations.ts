/**
 * Major-observation generation — ported 1:1 from the original `evaluate()`.
 * Kept separate from the engine so the deep core-logic narrative analysis is
 * easy to test and adjust independently of scoring.
 */
import type { CriterionResult, IssgResult } from "@/lib/types";
import { count } from "./matchers";

interface ObsInput {
  text: string;
  results: Record<string, CriterionResult>;
}

export function buildObservations({ text: stuText, results: r }: ObsInput): string[] {
  const obs: string[] = [];
  const score = (id: string) => r[id]?.score ?? 0;

  if (score("arrangement") < 0.25) obs.push("Assembly structure is missing or non-standard — no <beans> root with cc: namespace, or cc:workday-in not found.");
  if (score("swimlanes") === 0)
    obs.push("No diagram file or swimlane definitions found. Upload the .clar archive directly — assembly-diagram.xml is extracted automatically and all swimlanes will be evaluated.");
  if (score("swimlanes") > 0 && score("swimlanes") < 0.15)
    obs.push(
      'Diagram file recognised but swimlane definitions are incomplete. Add a dedicated "Global error handler" swimlane and named functional swimlanes (Start, Route, Update Email, etc.) to assembly-diagram.xml for full credit.'
    );
  if (score("error_handler") < 0.75)
    obs.push(
      'Global Error Handler is incomplete. Best practice: a dedicated "global-error-handler" mediation with a "Note-Error" component inside a "Global error handler" swimlane, AND handle-downstream-errors="true" set on every async-mediation to catch downstream/splitter errors.'
    );
  if (score("send_error") === 0)
    obs.push("No Local Error Handler detected — every cc:async-mediation must have a paired cc:send-error component routing to an error mediation or PutIntegrationMessage endpoint.");
  if (score("send_error") > 0 && score("send_error") < 0.2)
    obs.push(
      "Local Error Handler coverage is partial — some async-mediations lack a paired cc:send-error. Add cc:send-error to every mediation so each component (Splitter, SOAP call, Eval, etc.) has its own error route."
    );

  const ccLogInFile = count(stuText, "<cc:log[\\s>]");
  if (ccLogInFile > 0)
    obs.push(
      "🚨 No-Logs criterion = 0 / 0.25 (HARD ZERO): " +
        ccLogInFile +
        " <cc:log> raw assembly log component" +
        (ccLogInFile > 1 ? "s" : "") +
        " found in the assembly. Even ONE <cc:log> component (the yellow-highlighted \"Log\" in the reference) forces this criterion to zero regardless of other checks. These are debug-only logs that must be removed before submission — replace with cc:cloud-log."
    );

  // ─── Deep core-logic analysis ─────────────────────────────────────────────
  const hasGetWorkersFlow = /Get_Workers/i.test(stuText);
  const hasMaintainCIFlow = /Maintain_Contact_Information/i.test(stuText);
  const hasUpdateRouteWired =
    /name="Update_Email"|name="Email_Update"|route="Update_Email"|route="Email_Update"|routes-to="CallUpdateEmail"|routes-to="DoUpdateEmail"|routes-to="Email_Update"|routes-to="CallWebService"|Updating_Email/i.test(
      stuText
    );
  const hasNoUpdateRouteWired = /name="Already_Updated"|route="Already_Updated"|routes-to="CallUpdatedEmail"|No_Email_Updation|No_Email_Update/i.test(stuText);
  const hasMvelChooseRoute = /cc:choose-route[^>]+expression=/i.test(stuText);
  const hasNullSafeMvel = /==\s*null\s*\?\s*(&quot;&quot;|"")/i.test(stuText);

  const hasFlagBasedRoute = /props\['[A-Za-z0-9_.]+'\]\s*(==|!=)\s*['"](Yes|No|Y|N|True|False|true|false|1|0)['"]/i.test(stuText);
  const hasEmailComparison = /\.equals\(props\['[^']*[Ee]mail/i.test(stuText) || /props\['[^']*[Ee]mail[^']*'\]\.equals/i.test(stuText);
  const hasLowercase = /toLowerCase\(\)/.test(stuText);

  if (hasFlagBasedRoute && hasGetWorkersFlow && hasEmailComparison) {
    obs.push(
      "✓ Full dual-check logic detected: the integration uses flag-based routing (Y/N) as the first decision layer AND calls Get_Workers + email .equals comparison on the verification path — matching the reference doc's dual-check requirement."
    );
  } else if (!hasFlagBasedRoute && hasGetWorkersFlow && hasEmailComparison) {
    obs.push(
      "△ Verification logic correct (Get_Workers + email .equals comparison) but missing the dual-check's first layer — the flag-based routing. Per reference: IF flag=='Y' then update directly (no verification needed); IF flag=='N' then verify via Get_Workers and compare. Adding the flag-first layer avoids unnecessary Get_Workers calls on Y rows and matches the doc's intended flow."
    );
  } else if (hasFlagBasedRoute && !hasGetWorkersFlow) {
    obs.push(
      "⚠ Logic flaw — FLAG-ONLY ANTI-PATTERN: the route uses props['…Flag'] (Y/N) for routing but never calls Get_Workers. Per the reference dual-check, the N path must verify against Workday: Get_Workers + email .equals comparison. Without this, rows with flag=='N' are never checked against the actual Workday email — the integration trusts the file value and may either skip valid updates or update emails that are already correct. Add cc:workday-out-soap (application=\"Staffing\") + Get_Workers_Request + wd:Include_Personal_Information=true on the N branch, extract /wd:Email_Address_Data/wd:Email_Address via xpath, and compare against the file email."
    );
  } else if (hasGetWorkersFlow && !hasEmailComparison) {
    obs.push(
      'Logic incomplete — Get_Workers is called but the response email is not compared against the file email. Add a cc:eval that extracts /wd:Email_Address_Data/wd:Email_Address via xpath into a prop (e.g. props["p.email"]), then use it in the route: props["email"].equals(props["p.email"]).'
    );
  } else if (!hasGetWorkersFlow && !hasFlagBasedRoute) {
    obs.push(
      "Core logic missing both layers of the reference dual-check — no flag routing AND no Get_Workers call. The integration cannot make a correct Update vs No-Update decision without at minimum the Get_Workers + email comparison layer."
    );
  }

  if (hasMaintainCIFlow && !hasLowercase) {
    obs.push(
      '⚠ Reference requirement missed: "update email id of the employee in lowercase". No toLowerCase() call found in the assembly — the email value sent to Maintain_Contact_Information must be lowercased. Add: props["email"].toLowerCase() (and ideally lowercase the Workday email too before comparison so casing differences don\'t cause spurious updates).'
    );
  }

  if (!hasMaintainCIFlow) {
    obs.push(
      'Core logic does NOT update the email in Workday — there is no Maintain_Contact_Information_for_Person_Event_Request. The Update_Email branch must build this request in a cc:write and send it via cc:workday-out-soap (application="Human_Resources").'
    );
  }

  if (hasMvelChooseRoute && hasNoUpdateRouteWired && !hasUpdateRouteWired) {
    obs.push(
      'Routing flaw: only the "No Email Update" / "Already_Updated" branch is wired. When the email is missing or differs in Workday, the route must connect to an "Update_Email" sub-route that calls Maintain_Contact_Information — otherwise the integration just logs and never actually updates the email.'
    );
  }
  if (hasMvelChooseRoute && hasUpdateRouteWired && !hasNoUpdateRouteWired) {
    obs.push(
      'Routing flaw: only the "Update_Email" branch is wired — the "Already_Updated" sub-route is missing. Workers whose email already matches will be unnecessarily updated; add a sub-route routing to a cloud-log/no-op path for matching cases.'
    );
  }
  if (hasMvelChooseRoute && !hasNullSafeMvel && hasGetWorkersFlow) {
    obs.push(
      "Route MVEL expression is not null-safe — when Workday returns no email (xpath returns empty/null), the comparison can throw. Wrap each side with: (props['…'] == null ? \"\" : props['…']).equals(...)."
    );
  }

  if (score("core_logic") < 2.0)
    obs.push("Core logic score below 50% — check cc:workday-out-soap application/version attributes, cc:doc-iterator/cc:splitter usage, cc:route validation, cc:store output, and cc:cloud-log coverage.");
  if (score("cloud_log") < 0.4)
    obs.push(
      "cc:cloud-log branch coverage is minimal — log distinct outcomes per branch: email-updated (success), email-already-exists (alternate-success), and error variants. Pair with cc:aggregator + cc:store HTML output for a consolidated report."
    );

  // ISU/ISSG manual-scoring reminder (only when the ISU criterion is in play)
  if (r.isu) {
    obs.push(
      "⚠ ISU score is set to 0 automatically — manual scoring required. ISU attachment cannot be verified from the .clar file (it is configured in Workday tenant: Edit Integration System → Integration System Users). After verifying the ISU is bound in the tenant, override the ISU criterion score manually (max 1.0). The structural readiness indicators shown for ISU are HINTS for the grader, not auto-assigned points."
    );
    if (r.isu.checks && r.isu.checks.filter((c) => !c.pass).length > 0)
      obs.push(
        "CLAR ISU-readiness is incomplete — the cc:integration-system name, cc:workday-in entry, SOAP application= attributes, or WorkdayManifest.xml are missing/generic. The ISU binding may fail in the tenant if these structural elements aren't correct."
      );
  }

  if (score("naming_components") === 0)
    obs.push(
      'Component IDs do not follow PascalCase[-Context] convention or duplicate IDs found. Per Rule 14 use suffixing e.g. SendError-GetWorker, SendError-UpdateEmail. Avoid reusing id="SendError", id="Write", or id="Log" across multiple mediations.'
    );

  if (obs.length === 0) obs.push("No critical issues detected. Submission meets baseline expectations across all rubric areas.");
  return obs;
}

/** Overall remark band — ported 1:1. */
export function buildRemark(pct: number): string {
  return pct >= 85
    ? "Excellent. Strong command of Workday Studio — proper namespace usage, error handling chain, cloud-log coverage and web service configuration."
    : pct >= 70
    ? "Good submission. Most components correctly structured; minor gaps in error handling completeness or cloud-log coverage."
    : pct >= 55
    ? "Average. Core components present but incomplete — review error handler placement, send-error pairing, and cloud-log usage across all outcomes."
    : pct >= 40
    ? "Below average. Key structural elements missing — check cc:workday-in integration-system block, global error handler positioning, and downstream error handling."
    : "Needs significant work. Critical Workday Studio structural requirements are absent. Review assembly.xml root namespace, error handler chain, cc:cloud-log usage and SOAP service configuration.";
}

/** Grade band helper — ported 1:1. */
export function getGradeInfo(pct: number): { label: string; color: string } {
  if (pct >= 85) return { label: "Excellent", color: "#00d4a0" };
  if (pct >= 70) return { label: "Good", color: "#4ade80" };
  if (pct >= 55) return { label: "Average", color: "#f59e0b" };
  if (pct >= 40) return { label: "Below Avg", color: "#f97316" };
  return { label: "Needs Work", color: "#ef4444" };
}
