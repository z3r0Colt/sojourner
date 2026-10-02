import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useWestminsterCommentarySources } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import type { WestminsterSection } from "../../api/types";
import {
  EMPTY_GUIDE,
  GUIDE_SETTING,
  henryQuestion,
  parseHenry,
  sectionId,
  withLesson,
  type GuideState,
  type HenryAsk,
  type HenryItem,
  type LessonProgress,
  type QuizQuestion,
} from "./course";

export function useGuide() {
  const [state, setState, { isLoaded }] = useSetting<GuideState>(GUIDE_SETTING, EMPTY_GUIDE);
  const update = (lessonId: string, change: (p: LessonProgress) => LessonProgress) =>
    setState((prev) => withLesson(prev, lessonId, new Date().toISOString(), change));
  return { state, setState, isLoaded, update };
}

/** Henry's questions as the app's own copy of his Scripture Catechism has
 * them; any not found (a different copy) are left out. `ready` once every
 * entry asked for has loaded, for a printed sheet that waits for them. */
export function useHenryQuestions(asks: HenryAsk[]): QuizQuestion[] & { ready?: boolean } {
  const { data: sources } = useWestminsterCommentarySources();
  const sourceId = sources?.find((s) => s.code === "henry")?.id ?? null;
  const numbers = [...new Set(asks.map((a) => a.question))];
  const entries = useQueries({
    queries: numbers.map((n) => ({
      queryKey: ["westminsterCommentary", sourceId, n],
      queryFn: () => api.getWestminsterCommentary(sourceId as number, n),
      enabled: sourceId != null,
      staleTime: Infinity,
    })),
  });
  const key = entries.map((e) => e.dataUpdatedAt).join(",");
  const ready = sources != null && (sourceId == null || entries.every((e) => e.data != null || e.isError));
  return useMemo(() => {
    const items = new Map<number, HenryItem[]>();
    numbers.forEach((n, i) => items.set(n, (entries[i]?.data ?? []).flatMap((e) => parseHenry(e.body))));
    const out: QuizQuestion[] & { ready?: boolean } = asks.flatMap((a) => {
      const item = items.get(a.question)?.find((it) => it.ask === a.ask);
      return item ? [henryQuestion(item)] : [];
    });
    out.ready = ready;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, asks, ready]);
}

/** Shorter Catechism questions by number, whole (prompt and answer), for
 * printing. `null` until all have loaded. */
export function useCatechismAnswers(numbers: number[]): Map<number, WestminsterSection> | null {
  const results = useQueries({
    queries: numbers.map((n) => ({
      queryKey: ["westminsterSection", sectionId("wsc", n)],
      queryFn: () => api.getWestminsterSection(sectionId("wsc", n)),
      staleTime: Infinity,
    })),
  });
  const key = results.map((r) => r.dataUpdatedAt).join(",");
  return useMemo(() => {
    if (results.some((r) => r.data === undefined && !r.isError)) return null;
    const out = new Map<number, WestminsterSection>();
    numbers.forEach((n, i) => {
      const s = results[i]?.data;
      if (s) out.set(n, s);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, numbers.join(",")]);
}
