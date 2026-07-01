/**
 * Detect potential CLAR copying from a Workday User Activity report.
 *
 * The grader's concern: a trainee downloading another trainee's Studio CLAR
 * ("View Cloud Collection (Studio Project)" + Activity Category "DOWNLOAD").
 * We surface EVERY such download event so the grader can review who pulled
 * which project, and flag the ones where the downloaded target does not appear
 * to belong to the downloader (likely copying).
 */
import type { DownloadEvent, RaaSActivity } from "@/lib/types";

/** Activity Category that denotes a download/export action. */
const DOWNLOAD_RE = /\bdownload\b|\bexport\b/i;
/** Task that denotes opening/copying a Studio project's cloud collection. */
const CLOUD_COLLECTION_RE = /cloud\s*collection|studio\s*project/i;

/** Is this activity row a Studio-project download (the copying signal)? */
export function isDownloadEvent(row: RaaSActivity): boolean {
  const category = row.activityCategory ?? "";
  const task = row.task ?? "";
  return DOWNLOAD_RE.test(category) && CLOUD_COLLECTION_RE.test(task);
}

/** Lower-cased alphanumeric tokens of a string (names, filenames). */
function tokens(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/\.(clar|xml|txt|docx|pdf|json|zip)$/i, "")
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
}

/** Initials of a display name, e.g. "Monika Gupta" → "mg". */
function initials(name: string | undefined): string {
  return tokens(name)
    .map((t) => t[0])
    .join("");
}

/**
 * Heuristic: does the downloaded `target` look like it belongs to the
 * downloader? Studio CLARs here are named with the trainee's initials
 * (e.g. "SN_STUDIO_GHP_MG.clar" for Monika Gupta), so we match on:
 *   • any full name/username token (length ≥ 3), and
 *   • the downloader's initials (e.g. "mg").
 * If nothing matches, we treat it as cross-account (flag for review) rather
 * than silently clearing it.
 */
function targetBelongsToDownloader(ev: { username?: string; displayName?: string; target?: string }): boolean {
  const targetTokens = new Set(tokens(ev.target));
  if (targetTokens.size === 0) return false;

  const names = [...tokens(ev.displayName), ...tokens(ev.username)].filter((t) => t.length >= 3);
  if (names.some((t) => targetTokens.has(t))) return true;

  const ini = initials(ev.displayName);
  return ini.length >= 2 && targetTokens.has(ini);
}

/** Best human-readable label for the actor of an event. */
function downloaderLabel(row: RaaSActivity): string {
  return row.displayName || row.username || row.systemAccount || "(unknown account)";
}

/**
 * Extract every download/copy event from the activity rows. Each matching row
 * becomes one DownloadEvent; `crossAccount` is true when the target doesn't
 * appear to belong to the downloader.
 */
export function findDownloadEvents(rows: RaaSActivity[]): DownloadEvent[] {
  return rows.filter(isDownloadEvent).map((row) => ({
    downloader: downloaderLabel(row),
    username: row.username,
    displayName: row.displayName,
    target: row.target,
    task: row.task,
    activityCategory: row.activityCategory,
    requestTime: row.requestTime,
    ipAddress: row.ipAddress,
    tenant: row.tenant,
    crossAccount: !targetBelongsToDownloader(row),
  }));
}

/** Count download events attributable to a given student name. */
export function downloadCountForStudent(studentName: string, events: DownloadEvent[]): number {
  const sTokens = tokens(studentName).filter((t) => t.length >= 3);
  if (sTokens.length === 0) return 0;
  return events.filter((ev) => {
    const evTokens = new Set([...tokens(ev.displayName), ...tokens(ev.username)]);
    return sTokens.some((t) => evTokens.has(t));
  }).length;
}
