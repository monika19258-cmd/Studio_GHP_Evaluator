import { describe, it, expect } from "vitest";
import {
  evalArrangement,
  evalNoLogs,
  evalCoreLogic,
  evalNamingIntegration,
  evalISU,
  evalISSG,
  evalSendError,
} from "./criteria";
import { evaluate } from "./engine";
import { defaultRubric } from "./default-rubric";

/**
 * A compact but representative "good" assembly that exercises most criteria.
 * These tests pin the ported behavior so refactors can't silently change scores.
 */
const GOOD = `
<beans xmlns:cc="http://www.capeclear.com/assembly" version="2025.1">
  <cc:assembly>
    <cc:integration-system name="HemanthPawan_InboundStudio_GHPFinalExam_Batch6"/>
    <swimlanes name="Start"/><swimlanes name="Route"/><swimlanes name="Global error handler"/>
    <visualProperties x="10" y="20"/>
    <cc:async-mediation id="GetWorkers" handle-downstream-errors="true">
      <cc:workday-out-soap application="Staffing" version="v41.0">Get_Workers_Request</cc:workday-out-soap>
      <cc:send-error routes-to="ErrorHandler"/>
    </cc:async-mediation>
    <cc:async-mediation id="UpdateEmail" handle-downstream-errors="true">
      <cc:workday-out-soap application="Human_Resources" version="v41.0">Maintain_Contact_Information_for_Person_Event_Request</cc:workday-out-soap>
      <cc:send-error routes-to="ErrorHandler"/>
    </cc:async-mediation>
    <cc:async-mediation id="Splitter" handle-downstream-errors="true">
      <cc:splitter/><cc:send-error routes-to="ErrorHandler"/>
    </cc:async-mediation>
    <cc:workday-in id="Inbound"/>
    <cc:choose-route expression="props['email'].toLowerCase().equals(props['p.email'].toLowerCase())"/>
    <cc:route name="Update_Email"/><cc:route name="Already_Updated"/>
    <cc:store/><cc:cloud-log message="Email updated for @{props['id']}"/>
    <cc:cloud-log message="Email already exists - no update"/>
    <cc:aggregator/>
    <vm://wcc/PutIntegrationMessage/><vm://wcc/PutIntegrationMessage/>
    <cc:note id="Note-Error">context.errorMessage</cc:note>
    <wm:manifest><wm:clar version="1.0"/></wm:manifest>
  </cc:assembly>
</beans>`;

describe("ported criterion evaluators", () => {
  it("arrangement: full marks for proper structure", () => {
    expect(evalArrangement(GOOD).score).toBe(0.5);
  });

  it("naming_integration: matches the reference convention", () => {
    const r = evalNamingIntegration(GOOD);
    expect(r.checks.at(-1)?.pass).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("no_logs: HARD ZERO when a <cc:log> exists, regardless of other checks", () => {
    const withLog = GOOD + '<cc:log message="debug"/>';
    expect(evalNoLogs(withLog).score).toBe(0);
    // The cc:log check itself fails.
    expect(evalNoLogs(withLog).checks[0].pass).toBe(false);
  });

  it("no_logs: scores when only cc:cloud-log is used", () => {
    expect(evalNoLogs(GOOD).score).toBeGreaterThan(0);
  });

  it("core_logic: rewards the verify-only dual-check pattern with lowercase", () => {
    const r = evalCoreLogic(GOOD);
    expect(r.score).toBeGreaterThanOrEqual(2.5);
    expect(r.score).toBeLessThanOrEqual(4.0);
  });

  it("send_error: full coverage earns full marks", () => {
    expect(evalSendError(GOOD).score).toBe(0.25);
  });

  it("isu: auto-score is always 0 and flagged manual", () => {
    const r = evalISU(GOOD);
    expect(r.score).toBe(0);
    expect(r.requiresManualScoring).toBe(true);
  });

  it("issg: SOAP application= attributes imply a partial status", () => {
    expect(evalISSG(GOOD).status).toBe("partial");
  });
});

describe("engine.evaluate with the default rubric", () => {
  it("produces a numeric total and percentage", () => {
    const out = evaluate(GOOD, defaultRubric());
    expect(out.total).toBeGreaterThan(0);
    expect(out.pct).toBeGreaterThan(0);
    expect(out.results.arrangement.score).toBe(0.5);
    expect(out.issg.status).toBe("partial");
    expect(out.observations.length).toBeGreaterThan(0);
  });

  it("scales a built-in score proportionally when the weight is edited", () => {
    const rubric = defaultRubric();
    const arrangement = rubric.criteria.find((c) => c.id === "arrangement")!;
    arrangement.max = 1.0; // doubled from 0.5
    const out = evaluate(GOOD, rubric);
    expect(out.results.arrangement.score).toBe(1.0);
  });
});
