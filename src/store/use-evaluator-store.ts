/**
 * Global app state (Zustand): the editable rubric, the reference CLAR text,
 * student results, and fetched RAAS activity. UI components read/write here;
 * pure evaluation logic stays in lib/.
 */
"use client";

import { create } from "zustand";
import type { Criterion, DataCheck, DownloadEvent, RaaSActivity, Rubric, StudentResult } from "@/lib/types";
import { defaultRubric } from "@/lib/evaluation/default-rubric";
import { matchActivity } from "@/lib/raas/match";
import { findDownloadEvents } from "@/lib/raas/cheating";

interface EvaluatorState {
  rubric: Rubric;
  referenceText: string | null;
  rulesText: string[];
  students: StudentResult[];
  raasRows: RaaSActivity[];
  /** Studio-CLAR download/copy events detected in the activity report. */
  downloadEvents: DownloadEvent[];

  // Rubric editing
  setRubric: (r: Rubric) => void;
  resetRubric: () => void;
  updateCriterion: (id: string, patch: Partial<Criterion>) => void;
  removeCriterion: (id: string) => void;
  addCheck: (criterionId: string, check: DataCheck) => void;
  updateCheck: (criterionId: string, checkId: string, patch: Partial<DataCheck>) => void;
  removeCheck: (criterionId: string, checkId: string) => void;

  // Reference / rules
  setReferenceText: (t: string | null) => void;
  setRulesText: (t: string[]) => void;

  // Results
  setStudents: (s: StudentResult[]) => void;
  upsertStudent: (s: StudentResult) => void;
  setManualScore: (studentId: string, criterionId: string, score: number | undefined) => void;

  // RAAS
  setRaasRows: (rows: RaaSActivity[]) => void;
  applyRaasMatches: () => void;
  clearAll: () => void;
}

/** Recompute total/pct for a student given current manual overrides. */
function recompute(student: StudentResult, rubric: Rubric): StudentResult {
  const numeric = rubric.criteria.filter((c) => c.kind !== "issg" && c.max > 0);
  const maxTotal = numeric.reduce((s, c) => s + c.max, 0);
  const total = numeric.reduce((acc, c) => {
    const override = student.manualScores[c.id];
    const auto = student.results[c.id]?.score ?? 0;
    return acc + (override !== undefined ? override : auto);
  }, 0);
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  return { ...student, total, pct };
}

export const useEvaluatorStore = create<EvaluatorState>()((set, get) => ({
  rubric: defaultRubric(),
  referenceText: null,
  rulesText: [],
  students: [],
  raasRows: [],
  downloadEvents: [],

  setRubric: (r) => set({ rubric: r }),
  resetRubric: () => set({ rubric: defaultRubric() }),

  updateCriterion: (id, patch) =>
    set((st) => ({ rubric: { criteria: st.rubric.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) } })),

  removeCriterion: (id) => set((st) => ({ rubric: { criteria: st.rubric.criteria.filter((c) => c.id !== id) } })),

  addCheck: (criterionId, check) =>
    set((st) => ({
      rubric: { criteria: st.rubric.criteria.map((c) => (c.id === criterionId ? { ...c, checks: [...(c.checks || []), check] } : c)) },
    })),

  updateCheck: (criterionId, checkId, patch) =>
    set((st) => ({
      rubric: {
        criteria: st.rubric.criteria.map((c) =>
          c.id === criterionId ? { ...c, checks: (c.checks || []).map((ck) => (ck.id === checkId ? { ...ck, ...patch } : ck)) } : c
        ),
      },
    })),

  removeCheck: (criterionId, checkId) =>
    set((st) => ({
      rubric: { criteria: st.rubric.criteria.map((c) => (c.id === criterionId ? { ...c, checks: (c.checks || []).filter((ck) => ck.id !== checkId) } : c)) },
    })),

  setReferenceText: (t) => set({ referenceText: t }),
  setRulesText: (t) => set({ rulesText: t }),

  setStudents: (s) => set({ students: s }),
  upsertStudent: (s) =>
    set((st) => {
      const idx = st.students.findIndex((x) => x.id === s.id);
      const next = [...st.students];
      if (idx >= 0) next[idx] = s;
      else next.push(s);
      return { students: next };
    }),

  setManualScore: (studentId, criterionId, score) =>
    set((st) => ({
      students: st.students.map((s) => {
        if (s.id !== studentId) return s;
        const manualScores = { ...s.manualScores };
        if (score === undefined) delete manualScores[criterionId];
        else manualScores[criterionId] = score;
        return recompute({ ...s, manualScores }, st.rubric);
      }),
    })),

  setRaasRows: (rows) => {
    set({ raasRows: rows, downloadEvents: findDownloadEvents(rows) });
    get().applyRaasMatches();
  },

  applyRaasMatches: () =>
    set((st) => ({
      students: st.students.map((s) => ({ ...s, raas: matchActivity(s.name, st.raasRows) })),
    })),

  clearAll: () => set({ students: [], raasRows: [], downloadEvents: [], referenceText: null, rulesText: [] }),
}));
