# CLAR Evaluator

A modern reimplementation of the single-file Workday Studio CLAR batch evaluator as a
**Next.js (App Router) + TypeScript + React** app, styled with **Tailwind + shadcn/ui**
in the original dark / IBM-Plex / teal-accent aesthetic.

It preserves the original evaluation engine **1:1** (the 10-point rubric, the
`count`/`findFirst`/`has` matching engine, the tiered per-criterion scorers, the
`<cc:log>` hard-zero override, the dual-check email-routing analysis, and the ISU/ISSG
manual-scoring behavior) and adds two capabilities:

1. **Rule-driven evaluation** — upload reference rule documents (`.docx/.pdf/.md/.txt`)
   and a reference/answer-key CLAR. The rule docs are parsed into a structured, **editable
   rubric** (criteria, weights, pass/fail regex checks) that you review and adjust in the UI
   before running. Students are scored against the parsed rules **and** compared to the
   reference CLAR (gap analysis). The ported regex evaluators remain the **default matchers**,
   and new rules become data-driven criteria — **no code change required to add a rule**.
2. **Workday RAAS user-activity report** — fetch a User Activity report from a Workday
   RaaS URL using **ISU Basic-auth** credentials, via a **server-side Next.js route** (no CORS,
   no credential exposure). Rows are mapped to students by name/username and shown alongside
   each evaluation result.

---

## Architecture

```
clar-evaluator/
├── package.json · tsconfig.json · next.config.mjs · tailwind.config.ts
├── postcss.config.mjs · vitest.config.ts · components.json
├── .env.example · .gitignore
├── public/                      # put pdf.worker.min.mjs here (see Setup)
└── src/
    ├── app/
    │   ├── globals.css          # theme tokens (HSL) + IBM Plex fonts
    │   ├── layout.tsx
    │   ├── page.tsx             # header + Single / Batch mode tabs
    │   └── api/raas/route.ts    # SERVER-ONLY Workday RAAS fetch (Basic auth)
    ├── components/
    │   ├── ui/                  # shadcn-style primitives (button, card, input, table…)
    │   ├── file-drop.tsx        # drag/drop upload zone
    │   ├── rule-upload.tsx      # rule docs → rubric, reference CLAR → store
    │   ├── rubric-editor.tsx    # review & edit weights/checks before running
    │   ├── score-detail.tsx     # per-student detail + manual override
    │   ├── comparison-table.tsx # ranked batch table + RAAS column + drill-down
    │   ├── raas-panel.tsx       # ISU credential form → /api/raas
    │   ├── single-mode.tsx
    │   └── batch-mode.tsx
    ├── lib/
    │   ├── types.ts             # Rubric, Criterion, Check, StudentResult, RaaSActivity…
    │   ├── utils.ts             # cn()
    │   ├── parsing/file-readers.ts   # .clar(zip)/.docx/.pdf/.txt — fidelity-identical
    │   ├── evaluation/
    │   │   ├── matchers.ts      # count / findFirst / has / esc  (ported 1:1)
    │   │   ├── criteria.ts      # the 11 evaluators as typed pure functions (ported 1:1)
    │   │   ├── observations.ts  # major-observation narrative + remark/grade bands
    │   │   ├── default-rubric.ts# the default 10-point rubric (data-driven shape)
    │   │   ├── engine.ts        # evaluate(text, rubric) + compareToReference()
    │   │   └── run.ts           # buildStudentResult()
    │   ├── rubric/rule-parser.ts# rule docs → editable Rubric
    │   ├── raas/
    │   │   ├── schema.ts        # Zod validation + JSON/XML row normalization
    │   │   └── match.ts         # map RAAS rows → students by name/username
    │   └── csv.ts               # client-side CSV export
    └── store/use-evaluator-store.ts  # Zustand: rubric, results, RAAS, overrides
```

Tests (Vitest): `src/lib/evaluation/*.test.ts`, `src/lib/rubric/rule-parser.test.ts`.

---

## Setup

```bash
cd clar-evaluator
npm install
```

**PDF worker (one-time):** `pdfjs-dist` needs its worker served statically. Copy it into
`public/` so the readers can load `/pdf.worker.min.mjs`:

```bash
# macOS / Linux
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/

# Windows (PowerShell)
Copy-Item node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

(If your `pdfjs-dist` build ships `pdf.worker.min.js` instead of `.mjs`, copy that and update
`workerSrc` in `src/lib/parsing/file-readers.ts` accordingly.)

### Environment variables

Copy `.env.example` → `.env.local`. All RAAS env vars are **optional** and **server-side only**:

| Var | Purpose |
| --- | --- |
| `RAAS_USERNAME` / `RAAS_PASSWORD` | ISU credentials fallback. If set, the grader can leave the UI fields blank. Read only in the API route; never sent to the browser, never logged. |
| `RAAS_ALLOWED_URL_PREFIX` | Optional allow-list. If set, the UI-supplied RaaS URL must start with this value (prevents the route being used as an open proxy). |

### Run

```bash
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck  # tsc --noEmit
npm test           # vitest (pins the ported scoring logic)
```

---

## How the rule-upload flow works

1. In **Single** or **Batch** mode, open **“Rules & Reference (rule-driven evaluation)”**.
2. Upload one or more **rule documents** (`.docx/.pdf/.md/.txt`). They are extracted to text
   client-side and parsed by `lib/rubric/rule-parser.ts`:
   - Lines that look like rubric items (`… — N marks`, numbered/bulleted, markdown table
     rows) yield a **criterion** with an extracted **weight**.
   - If a line matches a known criterion (e.g. “Global Error Handler”, “Core Logic”), the
     **ported built-in evaluator** is reused as its default matcher (original regex logic
     preserved), adopting the document’s weight.
   - Unknown rules become **data-driven** criteria, seeded with regex checks from any
     `cc:`/`wd:` tokens or keywords on the line.
   - “Merge with the default 10-point rubric” (default on) keeps all defaults and appends new
     rules; uncheck to use the parsed rules only.
3. Optionally upload the **reference / answer-key CLAR** — students are then compared against
   it and any “reference passes but student fails” checks are appended to observations.
4. Review/adjust everything in the **Rubric editor**: edit labels, weights, and per-check
   regex/`has`/`count` matchers; add or remove checks; remove criteria. Built-in scores are
   scaled proportionally when you change a weight.
5. Upload student CLAR(s) and **Analyse**. Output (scores, observations, remarks, ranking,
   grade bands, drill-down, CSV) is identical in shape to the original tool.

## How the RAAS flow works

1. Run a batch evaluation first (the activity column maps onto the comparison table).
2. In **“Workday RAAS — User Activity”**, enter the **RaaS report URL** (https) and ISU
   **username/password** (or leave blank to use the server env-var fallback). Optionally set
   the **Username** / **Display-name** field names to match your report’s columns.
3. The browser POSTs to **`/api/raas`** (server). The route:
   - validates input with **Zod**,
   - builds a **Basic-auth** header **in memory**,
   - appends `format=json` (or honors `format=xml`), and fetches Workday with a 60s timeout,
   - parses **JSON** or **XML** (via `fast-xml-parser`), extracting `Report_Entry` /
     `wd:Report_Data → wd:Report_Entry`,
   - **normalizes** rows to `RaaSActivity` and returns them.
4. Rows are matched to students by **username → display name → token overlap** and shown in
   the comparison table and CSV.

**Auth failures / empty results** are handled gracefully: 401/403 → a clear
“authentication failed” message; non-OK HTTP → `Workday returned HTTP <n>`; timeouts and
unreachable hosts → friendly 502s; zero rows → an info banner suggesting a field-map/prompt
check. Credentials are **never** logged, persisted, or returned to the client; the password is
also cleared from the browser form once the request is sent.

---

## Security notes (ISU credentials)

- Credentials are accepted **only** in the request body or from server env vars, used solely
  to construct the outbound `Authorization` header, and discarded when the request ends.
- The Workday call happens **server-side** (`runtime = "nodejs"`), so the ISU password never
  reaches the browser bundle and CORS is avoided.
- No credential value is ever passed to `console.*` or written to disk.
- `RAAS_ALLOWED_URL_PREFIX` provides optional defense-in-depth against SSRF/open-proxy abuse.

## Notes & deviations from the original

- Scoring math, regex patterns, tier thresholds and the `<cc:log>` hard-zero are ported
  verbatim; unit tests pin the key scores.
- The original always-included ISU manual-scoring reminder is emitted only when an ISU
  criterion is present in the (now editable) rubric.
- Percentages are computed against the rubric’s **actual** max total, so they stay correct
  when weights are edited or rules are added (the default rubric still totals 10).
