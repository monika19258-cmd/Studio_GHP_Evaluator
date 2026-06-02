import { describe, it, expect } from "vitest";
import { normalizeRows, DEFAULT_FIELD_MAP } from "./schema";
import { findDownloadEvents, isDownloadEvent, downloadCountForStudent } from "./cheating";

// A Workday "View User Activity" report row (JSON RaaS shape), event-level.
const downloadRow = {
  Request_Time: "06/02/2026 01:08:02.142 AM",
  System_Account: "rsaklani-trn / Rahul Saklani",
  IP_Address: "118.185.170.56",
  Task: "View Cloud Collection (Studio Project)",
  Target: "SN_STUDIO_GHP_MG.clar",
  Activity_Category: "DOWNLOAD",
};

const ownDownloadRow = {
  Request_Time: "06/02/2026 02:00:00.000 AM",
  System_Account: "mgupta-trn / Monika Gupta",
  IP_Address: "10.0.0.2",
  Task: "View Cloud Collection (Studio Project)",
  Target: "SN_STUDIO_GHP_MG.clar", // belongs to Monika Gupta
  Activity_Category: "DOWNLOAD",
};

const viewOnlyRow = {
  Request_Time: "06/02/2026 03:00:00.000 AM",
  System_Account: "jdoe-trn / John Doe",
  Task: "View Cloud Collection (Studio Project)",
  Target: "SN_STUDIO_GHP_JD.clar",
  Activity_Category: "VIEW", // not a download
};

describe("RAAS event normalization", () => {
  it("captures event-level fields with loose column-alias matching", () => {
    const [row] = normalizeRows([downloadRow], DEFAULT_FIELD_MAP);
    expect(row.task).toBe("View Cloud Collection (Studio Project)");
    expect(row.target).toBe("SN_STUDIO_GHP_MG.clar");
    expect(row.activityCategory).toBe("DOWNLOAD");
    expect(row.ipAddress).toBe("118.185.170.56");
    expect(row.requestTime).toContain("06/02/2026");
  });

  it("splits the System Account into username and display name", () => {
    const [row] = normalizeRows([downloadRow], DEFAULT_FIELD_MAP);
    expect(row.username).toBe("rsaklani-trn");
    expect(row.displayName).toBe("Rahul Saklani");
  });

  it("matches columns regardless of spaces/underscores/namespace prefixes", () => {
    const [row] = normalizeRows([{ "wd:Activity Category": "Download", "wd:Task": "View Cloud Collection" }], DEFAULT_FIELD_MAP);
    expect(row.activityCategory).toBe("Download");
    expect(row.task).toBe("View Cloud Collection");
  });
});

describe("download / copy detection", () => {
  it("flags DOWNLOAD + View Cloud Collection events", () => {
    const rows = normalizeRows([downloadRow, viewOnlyRow], DEFAULT_FIELD_MAP);
    expect(isDownloadEvent(rows[0])).toBe(true);
    expect(isDownloadEvent(rows[1])).toBe(false);
  });

  it("extracts one DownloadEvent per matching row", () => {
    const rows = normalizeRows([downloadRow, ownDownloadRow, viewOnlyRow], DEFAULT_FIELD_MAP);
    const events = findDownloadEvents(rows);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.downloader)).toEqual(["Rahul Saklani", "Monika Gupta"]);
  });

  it("marks a download of someone else's CLAR as cross-account", () => {
    const rows = normalizeRows([downloadRow], DEFAULT_FIELD_MAP);
    const [ev] = findDownloadEvents(rows);
    // Rahul downloaded Monika's CLAR -> cross-account.
    expect(ev.crossAccount).toBe(true);
  });

  it("does not flag a trainee downloading their own CLAR", () => {
    const rows = normalizeRows([ownDownloadRow], DEFAULT_FIELD_MAP);
    const [ev] = findDownloadEvents(rows);
    expect(ev.crossAccount).toBe(false);
  });

  it("counts download events attributable to a student name", () => {
    const rows = normalizeRows([downloadRow, ownDownloadRow], DEFAULT_FIELD_MAP);
    const events = findDownloadEvents(rows);
    expect(downloadCountForStudent("Rahul Saklani", events)).toBe(1);
    expect(downloadCountForStudent("Monika Gupta", events)).toBe(1);
    expect(downloadCountForStudent("Nobody Here", events)).toBe(0);
  });
});
