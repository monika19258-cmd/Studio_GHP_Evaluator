/**
 * ──────────────────────────────────────────────────────────────────────────
 *  FILE READERS  (client-side)
 *  CLAR/docx/pdf/text parsing with fidelity identical to the original tool.
 *
 *  • .clar/.zip → JSZip: extract assembly.xml, then assembly-diagram.xml, then
 *                 any remaining XML, concatenated into one searchable string.
 *  • .docx/.doc → mammoth raw text.
 *  • .pdf       → pdfjs-dist text extraction.
 *  • else       → plain text.
 *
 *  These libraries are browser-oriented, so this module is "use client".
 *  pdfjs-dist worker is configured lazily on first PDF parse.
 * ──────────────────────────────────────────────────────────────────────────
 */
"use client";

import JSZip from "jszip";

/** Read a File as text. */
export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

/** Read a File as an ArrayBuffer. */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/** Extract raw text from a .docx/.doc via mammoth (dynamic import keeps it out of the server bundle). */
export async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

/** Extract text from a PDF via pdfjs-dist. */
export async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker served from /public (see README) to avoid bundler/CORS issues.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = await readFileAsArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text;
}

/**
 * Parse a .clar/.zip archive.
 * Priority: assembly.xml (logic) → assembly-diagram.xml (swimlanes/layout) →
 * any remaining XML (manifest, settings). Concatenated so every criterion can
 * "see" swimlanes, global-error-handler, Note-Error and diagram artefacts.
 */
export async function parseClar(file: File): Promise<string> {
  const buf = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buf);
  const parts: string[] = [];

  const priority = ["assembly.xml", "assembly-diagram.xml"];
  const allFiles = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  for (const target of priority) {
    const match = allFiles.find((f) => f.toLowerCase().endsWith("/" + target) || f.toLowerCase() === target);
    if (match) parts.push(await zip.files[match].async("string"));
  }
  for (const f of allFiles) {
    const lower = f.toLowerCase();
    if (lower.endsWith(".xml") && !priority.some((p) => lower.endsWith("/" + p) || lower === p)) {
      parts.push(await zip.files[f].async("string"));
    }
  }
  if (parts.length === 0) throw new Error("No XML files found inside the CLAR archive");
  return parts.join("\n<!-- ═══ NEXT FILE ═══ -->\n");
}

/** Dispatch on file extension — the single entry point used by the UI. */
export async function readFile(file: File): Promise<string> {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx") || n.endsWith(".doc")) return parseDocx(file);
  if (n.endsWith(".pdf")) return parsePdf(file);
  if (n.endsWith(".clar") || n.endsWith(".zip")) return parseClar(file);
  return readFileAsText(file);
}
