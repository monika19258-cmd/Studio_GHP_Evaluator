/**
 * ──────────────────────────────────────────────────────────────────────────
 *  CRITERION EVALUATORS — ported 1:1 from clar_batch_evaluator.html into
 *  typed, pure functions. Each returns { score, checks, ... }. The regex
 *  patterns, tier thresholds and hard-zero overrides are preserved exactly;
 *  unit tests in src/lib/evaluation/criteria.test.ts pin the behavior.
 * ──────────────────────────────────────────────────────────────────────────
 */
import type { Check, CriterionResult, IssgResult, BuiltinEvaluatorKey } from "@/lib/types";
import { count, findFirst, has, esc } from "./matchers";

/* 1 ── ASSEMBLY ARRANGEMENT (0.5) */
export function evalArrangement(t: string): CriterionResult {
  const checks: Check[] = [];

  const hasBeansRoot = has(t, ["<beans[^>]*xmlns:cc", 'xmlns:cc="http://www.capeclear']);
  checks.push({ pass: hasBeansRoot, label: "Root <beans> with xmlns:cc (capeclear) namespace", found: findFirst(t, ["xmlns:cc"]) });

  const hasCCAssembly = has(t, ["<cc:assembly", "cc:assembly "]);
  checks.push({ pass: hasCCAssembly, label: "cc:assembly element present", found: findFirst(t, ["cc:assembly"]) });

  const hasWdIn = has(t, ["cc:workday-in"]);
  checks.push({ pass: hasWdIn, label: "cc:workday-in entry point declared", found: findFirst(t, ["cc:workday-in"]) });

  const mediationCount = count(t, "cc:async-mediation");
  checks.push({ pass: mediationCount >= 3, label: "Multiple cc:async-mediation blocks (found " + mediationCount + ")", found: findFirst(t, ["cc:async-mediation"]) });

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass === 4 ? 0.5 : pass === 3 ? 0.4 : pass === 2 ? 0.25 : pass === 1 ? 0.1 : 0, checks };
}

/* 2 ── SWIMLANES (0.25) */
export function evalSwimlanes(t: string): CriterionResult {
  const checks: Check[] = [];

  const hasDiagramFile = has(t, ["wdnm:Diagram", "xmlns:wdnm"]);
  checks.push({ pass: hasDiagramFile, label: "wdnm:Diagram format (assembly-diagram.xml) present", found: findFirst(t, ["wdnm:Diagram", "xmlns:wdnm"]) });

  const hasSwimlaneEl = has(t, ["<swimlanes ", "<swimlanes\n", "<swimlanes\t", "<swimlanes>"]);
  const swimCount = count(t, "<swimlanes");
  checks.push({ pass: hasSwimlaneEl, label: "<swimlanes> elements declared (found " + swimCount + ")", found: findFirst(t, ["<swimlanes"]) });

  checks.push({ pass: swimCount >= 3, label: "Multiple named swimlanes ≥3 (found " + swimCount + ")", found: findFirst(t, ['name="']) });

  const hasGlobalErrLane = has(t, ['name="Global error handler"', 'name="global-error-handler"', "Global error handler"]);
  checks.push({ pass: hasGlobalErrLane, label: '"Global error handler" swimlane defined (dedicated error lane best practice)', found: findFirst(t, ["Global error handler", "global-error-handler"]) });

  const hasCoords = has(t, ["visualProperties x=", "<visualProperties "]);
  checks.push({ pass: hasCoords, label: "visualProperties x/y coordinates present (all components positioned)", found: findFirst(t, ["visualProperties x="]) });

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass >= 4 ? 0.25 : pass === 3 ? 0.18 : pass === 2 ? 0.1 : pass === 1 ? 0.05 : 0, checks };
}

/* 3 ── GLOBAL ERROR HANDLER (1.5) */
export function evalErrorHandler(t: string): CriterionResult {
  const checks: Check[] = [];

  const posWorkdayIn = t.toLowerCase().indexOf("cc:workday-in");
  const posGlobalErr = Math.min(
    t.toLowerCase().indexOf("global") >= 0 ? t.toLowerCase().indexOf("global") : 999999,
    t.toLowerCase().indexOf('id="error') >= 0 ? t.toLowerCase().indexOf('id="error') : 999999,
    t.toLowerCase().indexOf('id="globalerror') >= 0 ? t.toLowerCase().indexOf('id="globalerror') : 999999
  );
  const putMsgCount = count(t, "vm://wcc/PutIntegrationMessage");

  const globalErrExact = /id="global-error-handler"/i.test(t);
  const globalErrMed = /id="[^"]*(?:global[^"]*error|error[^"]*global)[^"]*"/i.test(t);
  const hasNoteError = has(t, ['id="Note-Error"', 'id="NoteError"', "<cc:note[^>]*[Ee]rror", "Note-Error"]);
  const hasGlobalSwim = has(t, ['name="Global error handler"', 'name="global-error-handler"', "Global error handler"]);
  const hasPreWdInErr = posWorkdayIn > 0 && posGlobalErr < posWorkdayIn && posGlobalErr < 999999;
  const hasWdPutMsg = putMsgCount >= 2;
  checks.push({
    pass: globalErrExact || globalErrMed || hasPreWdInErr || hasWdPutMsg || (hasNoteError && hasGlobalSwim),
    label:
      "Global error handler — dedicated component (global-error-handler / Note-Error swimlane) or vm://wcc/PutIntegrationMessage routing (found " +
      putMsgCount +
      ")",
    found: findFirst(t, ['id="global-error-handler"', "GlobalErrorHandler", "vm://wcc/PutIntegrationMessage", "Note-Error"]),
  });

  checks.push({ pass: hasNoteError || hasGlobalSwim, label: 'Note-Error component or "Global error handler" swimlane present', found: findFirst(t, ["Note-Error", "Global error handler"]) });

  const hdCount = count(t, 'handle-downstream-errors="true"');
  const medOpenCount = count(t, "<cc:async-mediation[\\s>]");
  const hdCoverage = medOpenCount > 0 ? hdCount / medOpenCount : 0;
  checks.push({
    pass: hdCount >= 1 && hdCoverage >= 0.7,
    label:
      'handle-downstream-errors="true" coverage on cc:async-mediation (' +
      hdCount +
      "/" +
      medOpenCount +
      " = " +
      Math.round(hdCoverage * 100) +
      "% — required to catch downstream/splitter errors)",
    found: findFirst(t, ['handle-downstream-errors="true"']),
  });

  const seCount = count(t, "cc:send-error");
  checks.push({ pass: seCount >= 1, label: "cc:send-error components present (found " + seCount + ")", found: findFirst(t, ["cc:send-error"]) });

  const errorMedCount = count(t, 'id="[^"]*[Ee]rror[^"]*"');
  checks.push({ pass: errorMedCount >= 2, label: "Multiple error-handling mediations by ID (found " + errorMedCount + ")", found: findFirst(t, ['id="Error', 'id="Err', 'id="SendError', 'id="error']) });

  const hasCtxErr = has(t, ["context\\.errorMessage", "context.errorMessage"]);
  checks.push({ pass: hasCtxErr, label: "context.errorMessage used in error handlers", found: findFirst(t, ["context.errorMessage"]) });

  const pass = checks.filter((c) => c.pass).length;
  const sc = pass === 6 ? 1.5 : pass === 5 ? 1.3 : pass === 4 ? 1.0 : pass === 3 ? 0.75 : pass === 2 ? 0.4 : pass === 1 ? 0.2 : 0;
  return { score: sc, checks };
}

/* 4 ── LOCAL ERROR HANDLER (0.25) */
export function evalSendError(t: string): CriterionResult {
  const checks: Check[] = [];

  const sendErrCount = count(t, "cc:send-error");
  const medCount = count(t, "<cc:async-mediation[\\s>]");
  checks.push({
    pass: sendErrCount >= 1,
    label: "cc:send-error local error handler present (" + sendErrCount + " send-errors across " + medCount + " async-mediations)",
    found: findFirst(t, ["cc:send-error"]),
  });

  const coverage = medCount > 0 ? sendErrCount / medCount : 0;
  checks.push({
    pass: coverage >= 0.7,
    label: "Local error handler coverage: " + Math.round(coverage * 100) + "% of cc:async-mediations have paired cc:send-error (target: ≥70%)",
    found: coverage > 0 ? coverage.toFixed(2) + " send-errors per mediation" : null,
  });

  const routesToErr = has(t, ['routes-to="[^"]*[Ee]rror', 'routes-to="[^"]*[Ee]rr', 'routes-to="PutIntegrationMessage']);
  checks.push({
    pass: routesToErr,
    label: "cc:send-error routes-to error mediation or PutIntegrationMessage endpoint",
    found: findFirst(t, ['routes-to="Error', 'routes-to="Err', 'routes-to="PutIntegrationMessage']),
  });

  const pass = checks.filter((c) => c.pass).length;
  const sc = pass === 3 ? 0.25 : pass === 2 ? 0.18 : pass === 1 ? 0.1 : 0;
  return { score: sc, checks };
}

/* 5 ── NAMING CONVENTION OF INTEGRATIONS (1.0) */
export function evalNamingIntegration(t: string): CriterionResult {
  const checks: Check[] = [];

  const hasSoap = has(t, ["cc:workday-out-soap"]);
  checks.push({ pass: hasSoap, label: "cc:workday-out-soap (outbound SOAP) present", found: findFirst(t, ["cc:workday-out-soap"]) });

  const hasSplitterAggr = has(t, ["cc:splitter", "cc:aggregator"]);
  checks.push({ pass: hasSplitterAggr, label: "cc:splitter or cc:aggregator (inbound processing pipeline) present", found: findFirst(t, ["cc:splitter", "cc:aggregator"]) });

  const hasWdIn = has(t, ["<cc:workday-in[^>]*id=", "cc:workday-in id="]);
  checks.push({ pass: hasWdIn, label: "cc:workday-in with id= (inbound entry named)", found: findFirst(t, ["cc:workday-in id="]) });

  const intNameM = t.match(/cc:integration-system[^>]+name="([^"]+)"/i);
  const intName = intNameM ? intNameM[1] : "";
  const conventionRegex = /^[A-Za-z][A-Za-z0-9]*_(Inbound|Outbound)Studio_GHPFinalExam_Batch\d+$/;
  const matchesConvention = conventionRegex.test(intName);
  let conventionIssue = "";
  if (!intName) {
    conventionIssue = "no cc:integration-system name= found";
  } else if (!matchesConvention) {
    const issues: string[] = [];
    if (!/_(Inbound|Outbound)Studio/i.test(intName)) issues.push('missing "InboundStudio" or "OutboundStudio"');
    if (!/GHPFinalExam/i.test(intName)) issues.push('missing "GHPFinalExam"');
    if (!/Batch\d+/i.test(intName)) issues.push('missing "Batch<N>" (e.g. "B7" should be "Batch7")');
    if (/^[^A-Za-z]/.test(intName)) issues.push("does not start with a letter");
    conventionIssue = issues.length ? issues.join(", ") : "does not match <Name>_(Inbound|Outbound)Studio_GHPFinalExam_Batch<N>";
  }
  checks.push({
    pass: matchesConvention,
    label: matchesConvention
      ? 'cc:integration-system name matches reference convention ("' + esc(intName) + '")'
      : "cc:integration-system name does NOT match required convention <Name>_(Inbound|Outbound)Studio_GHPFinalExam_Batch<N> — " +
        conventionIssue +
        ' (got "' +
        esc(intName) +
        '")',
    found: intName || null,
  });

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass === 4 ? 1.0 : pass === 3 ? 0.75 : pass === 2 ? 0.45 : pass === 1 ? 0.25 : 0, checks };
}

/* 6 ── CORE LOGICAL PART (4.0 = 4×1.0 sub-criteria) */
export function evalCoreLogic(t: string): CriterionResult {
  const checks: Check[] = [];
  const subScores: number[] = [];

  // ── Sub 1: cc:cloud-log for outcome coverage
  const cloudLogCount = count(t, "cc:cloud-log");
  const hasCloudLog = cloudLogCount >= 1;
  const cloudLogMsgMatches = t.match(/<cc:cloud-log[^>]+message="([^"]+)"/gi) || [];
  const distinctCloudMsgs = new Set(
    cloudLogMsgMatches
      .map((m) => (m.match(/message="([^"]+)"/i) || [])[1] || "")
      .map((s) => s.toLowerCase().replace(/@\{[^}]+\}/g, "").replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0)
  );
  const hasMultiBranchLog = distinctCloudMsgs.size >= 2;
  const logHasError = has(t, ["[Ee]rror[^<]*cc:cloud-log", "cc:cloud-log[^<]*[Ee]rror", 'message="[^"]*(?:error|fail|Error|Fail)']);
  const logHasSuccess = has(t, [
    "[Ss]uccess[^<]*cc:cloud-log",
    "cc:cloud-log[^<]*[Ss]uccess",
    'message="[^"]*(?:success|Success|complete|Complete|updat|Updat|already|Already|exist|Exist)',
  ]);
  const sub1 = hasMultiBranchLog && (logHasError || logHasSuccess);
  checks.push({
    pass: sub1,
    label: "cc:cloud-log branch coverage: " + distinctCloudMsgs.size + " distinct outcome messages (" + cloudLogCount + " total cloud-logs)",
    found: findFirst(t, ["cc:cloud-log"]),
  });
  subScores.push(sub1 ? 1.0 : hasCloudLog && (logHasSuccess || logHasError) ? 0.75 : hasCloudLog ? 0.5 : 0);

  // ── Sub 2: Web service calls
  const hasSoap = has(t, ["cc:workday-out-soap"]);
  const hasApp = has(t, ['application="', "application='"]);
  const hasVersion = has(t, ['version="[0-9]', 'version="v[0-9]', "version='[0-9]"]);
  const hasGetWorkers = has(t, ["Get_Workers_Request", "Get_Workers_Response", "wd:Get_Workers"]);
  const hasMaintainCI = has(t, ["Maintain_Contact_Information"]);
  const sub2Base = hasSoap && hasApp && hasVersion;
  const sub2Full = sub2Base && hasGetWorkers && hasMaintainCI;
  checks.push({
    pass: sub2Full,
    label: "cc:workday-out-soap with application/version AND both Get_Workers (lookup) and Maintain_Contact_Information (update) calls",
    found: findFirst(t, ["Get_Workers", "Maintain_Contact_Information", "application="]),
  });
  subScores.push(
    sub2Full ? 1.0 : sub2Base && (hasGetWorkers || hasMaintainCI) ? 0.75 : sub2Base ? 0.5 : hasSoap && (hasApp || hasVersion) ? 0.35 : hasSoap ? 0.2 : 0
  );

  // ── Sub 3: Workplace tests from input file + downstream error handlers
  const hasIterator = has(t, ["cc:doc-iterator", "cc:splitter"]);
  const hasDownstream = has(t, ['handle-downstream-errors="true"']);
  const hasGetDoc = has(t, ["cc:get-event-document"]);
  const sub3 = (hasIterator || hasGetDoc) && hasDownstream;
  checks.push({ pass: sub3, label: 'cc:doc-iterator/cc:splitter + handle-downstream-errors="true"', found: findFirst(t, ["cc:doc-iterator", "cc:splitter", "handle-downstream-errors"]) });
  subScores.push(sub3 ? 1.0 : hasIterator || hasGetDoc || hasDownstream ? 0.5 : 0);

  // ── Sub 4: Comparison routing — DUAL-CHECK
  const hasValidate = has(t, ["cc:validate-exp", "<cc:validate"]);
  const hasRoute = has(t, ["cc:route", "cc:mvel-strategy"]);
  const hasFlagBasedRoute = /props\['[A-Za-z0-9_.]+'\]\s*(==|!=)\s*['"](Yes|No|Y|N|True|False|true|false|1|0)['"]/i.test(t);
  const hasEmailEqualsCheck =
    /\.equals\(props\['[^']*[Ee]mail/i.test(t) ||
    /props\['[^']*[Ee]mail[^']*'\]\.equals/i.test(t) ||
    /props\['[^']*[Ee]mail[^']*'\]\s*==\s*props\['[^']*[Ee]mail/i.test(t);
  const hasUpdateBranch = has(t, [
    'name="Update_Email"',
    'name="Email_Update"',
    'route="Update_Email"',
    'route="Email_Update"',
    'routes-to="CallUpdateEmail"',
    'routes-to="DoUpdateEmail"',
    'routes-to="Email_Update"',
    'routes-to="CallWebService"',
    "Updating_Email",
  ]);
  const hasNoUpdateBranch = has(t, [
    'name="Already_Updated"',
    'route="Already_Updated"',
    'routes-to="CallUpdatedEmail"',
    "No_Email_Updation",
    "No_Email_Update",
    "Email_Exists",
  ]);
  const hasBothBranches = hasUpdateBranch && hasNoUpdateBranch;
  const hasStore = has(t, ["cc:store"]);
  const hasTxt = has(t, ["\\.txt", "text/plain", 'txt"', "txt'", "\\.TXT"]);
  const hasHtmlOut = has(t, ["output-file-type=", 'output-file-type="HTML"', '\\.html"', "\\.html'"]);
  const hasLowercaseEmail = /toLowerCase\(\)/.test(t);

  const hasFullDualCheck = hasFlagBasedRoute && hasGetWorkers && hasEmailEqualsCheck;
  const hasVerifyOnly = !hasFlagBasedRoute && hasGetWorkers && hasEmailEqualsCheck;
  const hasFlagOnlyAntiPat = hasFlagBasedRoute && !hasGetWorkers;
  const baseOk = hasBothBranches && (hasStore || hasHtmlOut || hasTxt);

  const sub4Full = hasFullDualCheck && baseOk;
  const sub4Verify = hasVerifyOnly && baseOk;
  const sub4AntiPat = hasFlagOnlyAntiPat && baseOk;
  const sub4Legacy = hasValidate && (hasStore || hasTxt);
  const sub4 = sub4Full || sub4Verify || sub4AntiPat || sub4Legacy || (hasRoute && hasBothBranches);

  let sub4Label: string;
  if (sub4Full) sub4Label = "✓ FULL DUAL-CHECK: Flag (Y/N) routing + Get_Workers email verification + both branches + output" + (hasLowercaseEmail ? " + lowercase" : "");
  else if (sub4Verify) sub4Label = "△ Verification-only: Get_Workers + email .equals + both branches + output (correct logic but missing the flag-first routing layer)";
  else if (sub4AntiPat) sub4Label = "⚠ FLAG-ONLY ANTI-PATTERN: routes on input flag (Y/N) but never calls Get_Workers — N-path rows are never verified against Workday";
  else sub4Label = "Comparison routing incomplete — missing route, branches, or output";
  checks.push({ pass: sub4, label: sub4Label, found: findFirst(t, ['name="Update_Email"', 'name="Already_Updated"', "cc:validate-exp"]) });

  subScores.push(
    sub4Full && hasLowercaseEmail
      ? 1.0
      : sub4Full
      ? 0.9
      : sub4Verify && hasLowercaseEmail
      ? 0.85
      : sub4Verify
      ? 0.75
      : sub4AntiPat
      ? 0.3
      : sub4Legacy
      ? 0.5
      : hasRoute && hasBothBranches
      ? 0.4
      : hasRoute && (hasUpdateBranch || hasNoUpdateBranch)
      ? 0.3
      : hasRoute || hasValidate
      ? 0.2
      : hasStore
      ? 0.15
      : hasTxt
      ? 0.1
      : 0
  );

  return { score: Math.min(subScores.reduce((a, b) => a + b, 0), 4.0), checks };
}

/* 7 ── NAMING CONVENTION OF STUDIO COMPONENTS (0.25) */
export function evalNamingComponents(t: string): CriterionResult {
  const checks: Check[] = [];

  const idRe = /id="([^"]+)"/gi;
  const ids: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(t)) !== null) {
    if (!seen.has(m[1])) {
      ids.push(m[1]);
      seen.add(m[1]);
    }
  }

  const goodIds = ids.filter((id) => /^[A-Z][a-zA-Z0-9]+(-[A-Z][a-zA-Z0-9]+)*$/.test(id));
  const ratio = ids.length > 0 ? goodIds.length / ids.length : 0;
  checks.push({ pass: ratio >= 0.5, label: "≥50% of IDs follow PascalCase[-Context] convention (" + goodIds.length + "/" + ids.length + ")", found: goodIds.slice(0, 3).join(", ") || null });

  const allIds: string[] = [];
  const dupeRe = /id="([^"]+)"/gi;
  while ((m = dupeRe.exec(t)) !== null) allIds.push(m[1].toLowerCase());
  const dupCount = allIds.length - new Set(allIds).size;
  checks.push({ pass: dupCount === 0, label: "Zero duplicate id= attributes (found " + dupCount + " duplicates)", found: dupCount > 0 ? "Duplicates detected" : null });

  const hasVersion = has(t, ['version="20[12][0-9]', "version='20[12][0-9]", 'version="2019']);
  checks.push({ pass: hasVersion, label: "cc:assembly version= declared (2019.6 baseline or later — e.g. 2025.x)", found: findFirst(t, ['version="20']) });

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass === 3 ? 0.25 : pass === 2 ? 0.17 : pass === 1 ? 0.08 : 0, checks };
}

/* 8 ── NOT HAVING LOGS IN THE ASSEMBLY (0.25) — HARD ZERO on any <cc:log> */
export function evalNoLogs(t: string): CriterionResult {
  const checks: Check[] = [];

  const ccLogCount = count(t, "<cc:log[\\s>]");
  const noCcLog = ccLogCount === 0;
  checks.push({
    pass: noCcLog,
    label: noCcLog
      ? "No <cc:log> raw assembly log components ✓"
      : "HARD ZERO — found " + ccLogCount + " <cc:log> raw assembly log component" + (ccLogCount > 1 ? "s" : "") + " (these must be removed — use cc:cloud-log instead)",
    found: ccLogCount > 0 ? findFirst(t, ["<cc:log"]) : "None found ✓",
  });

  const rawLogPatterns = ["System\\.out\\.print", "console\\.log", "println\\(", "System\\.err", "std::cout", "logger\\.debug", "Logger\\.debug", "DEBUG\\s*\\("];
  const hasRaw = has(t, rawLogPatterns);
  checks.push({ pass: !hasRaw, label: "No raw System.out/console.log/println debug statements", found: hasRaw ? findFirst(t, rawLogPatterns) : "None found ✓" });

  const cloudLogCount = count(t, "cc:cloud-log");
  checks.push({ pass: cloudLogCount >= 1, label: "cc:cloud-log used (correct Workday logging — found " + cloudLogCount + ")", found: findFirst(t, ["cc:cloud-log"]) });

  const evalCount = count(t, "cc:eval");
  checks.push({ pass: evalCount <= 20, label: "cc:eval usage not excessive (found " + evalCount + " — high count may indicate debug code)", found: evalCount > 20 ? evalCount + " cc:eval blocks" : "OK" });

  // HARD-ZERO OVERRIDE: ANY <cc:log> present → score 0 regardless of other checks.
  if (ccLogCount > 0) {
    return { score: 0, checks };
  }

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass === 4 ? 0.25 : pass === 3 ? 0.17 : pass === 2 ? 0.08 : 0, checks };
}

/* 9 ── USAGE OF CLOUD-LOG (1.0 — grace marking) */
export function evalCloudLog(t: string): CriterionResult {
  const checks: Check[] = [];

  const cloudLogCount = count(t, "cc:cloud-log");
  checks.push({ pass: cloudLogCount >= 1, label: "cc:cloud-log component present (found " + cloudLogCount + ")", found: findFirst(t, ["cc:cloud-log"]) });

  const cloudLogMatches = t.match(/<cc:cloud-log[^>]+message="([^"]+)"/gi) || [];
  const distinctMsgs = new Set(
    cloudLogMatches
      .map((m) => (m.match(/message="([^"]+)"/i) || [])[1] || "")
      .map((s) => s.toLowerCase().replace(/@\{[^}]+\}/g, "").replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0)
  );
  const sampleMsg = cloudLogMatches[0] ? (cloudLogMatches[0].match(/message="([^"]+)"/i) || [])[1] : null;
  checks.push({
    pass: distinctMsgs.size >= 2,
    label: "Multi-branch cloud-log coverage: " + distinctMsgs.size + " distinct outcome messages logged across sub-assemblies",
    found: sampleMsg ? esc(sampleMsg.substring(0, 80)) : null,
  });

  const hasErrMsg = has(t, ["[Ee]rror", "[Ff]ail", "[Ff]ault"]);
  checks.push({ pass: hasErrMsg, label: "Error/fail/fault message content present", found: findFirst(t, ["Error", "Fail", "Fault"]) });

  const hasSuccessMsg = has(t, ["[Ss]uccess", "[Cc]omplete", "[Ff]inish", "[Uu]pdat", "[Ee]xists", "[Aa]lready"]);
  checks.push({ pass: hasSuccessMsg, label: "Success/complete/updated/already-exists message content present", found: findFirst(t, ["Success", "Complete", "Finish", "updated", "already", "Updated"]) });

  const hasHtmlOut = has(t, ['output-file-type="HTML"', "output-file-type='HTML'", '\\.html"', "\\.html'"]);
  const hasAggregator = has(t, ["cc:aggregator"]);
  const hasVarConsolidate = has(t, ["variable-name="]) && has(t, ['input="variable"', "input='variable'"]);
  checks.push({
    pass: hasHtmlOut || hasAggregator || hasVarConsolidate,
    label: "Consolidated log report: cc:aggregator OR variable-name accumulator OR HTML output",
    found: findFirst(t, ['output-file-type="HTML"', "cc:aggregator", "variable-name=", "\\.html"]),
  });

  const pass = checks.filter((c) => c.pass).length;
  return { score: pass === 5 ? 1.0 : pass === 4 ? 0.8 : pass === 3 ? 0.6 : pass === 2 ? 0.4 : pass === 1 ? 0.2 : 0, checks };
}

/* 10 ── ISU-READY CONFIGURATION (1.0) — auto-score always 0 (manual) */
export function evalISU(t: string): CriterionResult {
  const checks: Check[] = [];

  const intSysNameM = t.match(/cc:integration-system[^>]+name="([^"]+)"/i);
  const intSysName = intSysNameM ? intSysNameM[1] : "";
  const hasDescIntSys = intSysName.length > 5 && !/^(integration|test|new|default|sample|untitled)$/i.test(intSysName.trim());
  checks.push({
    pass: hasDescIntSys,
    label: 'cc:integration-system declared with descriptive name ("' + esc(intSysName) + '") — must match registered Integration System in tenant where ISU is bound',
    found: intSysName || null,
  });

  const hasWdIn = has(t, ["<cc:workday-in[^>]*id=", "cc:workday-in id="]);
  checks.push({ pass: hasWdIn, label: "cc:workday-in entry point declared (the inbound execution context that runs under the bound ISU)", found: findFirst(t, ["cc:workday-in id="]) });

  const hasSoapApps = has(t, ['application="Staffing"', 'application="Human_Resources"', 'application="Integration"', 'application="Compensation"', 'application="Talent"']);
  checks.push({
    pass: hasSoapApps,
    label: "cc:workday-out-soap with Workday application= attribute (ISU must hold matching security domains for these applications)",
    found: findFirst(t, ['application="Staffing"', 'application="Human_Resources"', 'application="Integration"']),
  });

  const hasManifest = has(t, ["wm:manifest", "wm:clar version=", "workdayManifest", "xmlns:wm=", "wm:author", "wm:timestamp"]);
  checks.push({
    pass: hasManifest,
    label: "WorkdayManifest.xml present (CLAR is packaged for tenant deployment — required before tenant-side ISU attachment)",
    found: findFirst(t, ["wm:manifest", "wm:clar", "workdayManifest"]),
  });

  const pass = checks.filter((c) => c.pass).length;
  const readinessHint = pass === 4 ? "fully ready" : pass >= 2 ? "partially ready" : "not ready";
  return {
    score: 0,
    checks,
    requiresManualScoring: true,
    readinessHint: pass + "/4 structural checks passed (" + readinessHint + " for ISU binding)",
    tenantNote:
      "AUTO-SCORE = 0 BY DESIGN. ISU attachment cannot be verified from the CLAR file — it is configured in the Workday tenant under: Edit Integration System → Integration System Users. After verifying that an ISU is bound to the registered Integration System, set this score manually (suggested max 1.0 if fully bound, 0 if not bound).",
  };
}

/* 11 ── ISSG TENANT BINDING (pass/partial/fail — no numeric score) */
export function evalISSG(t: string): IssgResult {
  const issgPatterns = ["\\bISSG\\b", "Integration System Security Group", "IntegrationSystemSecurityGroup"];
  const sgPatterns = ["Security_Group", "Security Group", "SecurityGroup", "securityGroup", "cloud:security", "domain_security"];
  const issgFound = findFirst(t, issgPatterns);
  const sgFound = findFirst(t, sgPatterns);
  const appDomains = t.match(/application="(Staffing|Human_Resources|Integration|Compensation|Talent|Benefits|Payroll|Recruiting)"/gi) || [];
  const distinctApps = new Set(appDomains.map((a) => a.toLowerCase()));
  if (issgFound)
    return {
      status: "pass",
      note: "ISSG explicitly referenced in CLAR → " + esc(issgFound) + ". Tenant binding must still be verified under: Edit Integration System → Integration System Security Groups.",
    };
  if (sgFound) return { status: "partial", note: "Security group reference found (no explicit ISSG keyword) → " + esc(sgFound) + ". Confirm ISSG is created and bound in the Workday tenant." };
  if (distinctApps.size >= 1)
    return {
      status: "partial",
      note:
        "No ISSG reference in file, but SOAP application= attributes (" +
        [...distinctApps].join(", ") +
        ") imply the security domains the tenant-side ISSG must include. Verify ISSG exists in tenant with these domains.",
    };
  return {
    status: "fail",
    note: "No ISSG or security-group reference found. ISSG is configured in the Workday tenant — confirm it exists, has the required security domains, and is bound to the Integration System.",
  };
}

/** Registry mapping built-in evaluator keys → pure functions. */
export const BUILTIN_EVALUATORS: Record<BuiltinEvaluatorKey, (t: string) => CriterionResult> = {
  arrangement: evalArrangement,
  swimlanes: evalSwimlanes,
  error_handler: evalErrorHandler,
  send_error: evalSendError,
  naming_integration: evalNamingIntegration,
  core_logic: evalCoreLogic,
  naming_components: evalNamingComponents,
  no_logs: evalNoLogs,
  cloud_log: evalCloudLog,
  isu: evalISU,
};
