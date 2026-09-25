import { useCallback, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import {
  useMarkPrayerListPersonPrayed,
  usePrayerListPeople,
  useReadingPlanDays,
  useReadingPlans,
  useWestminsterDocuments,
  useWestminsterSections,
} from "../../api/queries";
import type { PrayerListPerson, ReadingPlan, ReadingPlanDay, WestminsterSection, WestminsterSectionSummary } from "../../api/types";
import { useSetting } from "../../hooks/useSetting";
import { toast } from "../../components/ui/toast";
import { longestUnprayed } from "../prayer/prayerListTime";
import {
  FAMILY_LOG_SETTING,
  FAMILY_SETTING,
  STARTER_PLAN,
  STARTER_TITLES,
  afterGathering,
  catechismFinished,
  catechismPlan,
  localDate,
  planFinished,
  type FamilyWorship,
} from "./familyWorship";

/** How many names come up to pray for each time. */
export const PRAY_FOR_COUNT = 3;

export function useFamilyState() {
  return useSetting<FamilyWorship | null>(FAMILY_SETTING, null);
}

export function useFamilyLog() {
  return useSetting<string[]>(FAMILY_LOG_SETTING, []);
}

/** The people on the prayer list the family prays through. */
export function familyPeople(people: PrayerListPerson[] | undefined, category: string | null): PrayerListPerson[] {
  const want = category?.trim().toLowerCase();
  return (people ?? []).filter((p) => p.active && (!want || p.category?.trim().toLowerCase() === want));
}

/** Questions of one catechism, fetched whole for the ones asked for. */
export function useCatechismQuestions(sectionIds: number[]): Map<number, WestminsterSection> {
  const results = useQueries({
    queries: sectionIds.map((id) => ({
      queryKey: ["westminsterSection", id],
      queryFn: () => api.getWestminsterSection(id),
      staleTime: Infinity,
    })),
  });
  return useMemo(() => {
    const m = new Map<number, WestminsterSection>();
    for (const r of results) if (r.data) m.set(r.data.id, r.data);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.data?.id ?? 0).join(",")]);
}

export interface Tonight {
  plan: ReadingPlan | undefined;
  day: ReadingPlanDay | undefined;
  planDone: boolean;
  /** The starter reading's heading ("The burning bush"), if it has one. */
  readingTitle: string | null;
  psalm: number | null;
  questions: WestminsterSectionSummary[] | undefined;
  learning: WestminsterSectionSummary | undefined;
  review: WestminsterSectionSummary[];
  catechismDone: boolean;
  catechismTitle: string | null;
  /** Everyone the family prays through, and tonight's few from them. */
  everyone: PrayerListPerson[];
  prayFor: PrayerListPerson[];
}

/**
 * The family's setup, what tonight holds, and `finish` to write a gathering
 * down: the log, the next reading and question, the psalm on the first four
 * weeks, and a prayer logged for each name the family kept ticked.
 */
export function useFamilyWorship() {
  const [state, setState, { isLoaded }] = useFamilyState();
  const [log, setLog, { isLoaded: logLoaded }] = useFamilyLog();
  const { data: plans } = useReadingPlans();
  const { data: days } = useReadingPlanDays(state?.plan?.code ?? null);
  const { data: docs } = useWestminsterDocuments();
  const catechismDoc = docs?.find((d) => d.code === state?.catechism?.code);
  const { data: questions } = useWestminsterSections(catechismDoc?.id ?? null);
  const { data: people } = usePrayerListPeople();
  const markPrayed = useMarkPrayerListPersonPrayed();
  const qc = useQueryClient();

  const tonight = useMemo<Tonight | null>(() => {
    if (!state) return null;
    const plan = plans?.find((p) => p.code === state.plan?.code);
    const planDone = planFinished(state, plan?.length_days);
    const day = state.plan && !planDone ? days?.find((d) => d.day_number === state.plan!.nextDay) : undefined;
    const readingTitle = state.plan?.code === STARTER_PLAN && day ? (STARTER_TITLES[day.day_number - 1] ?? null) : null;

    let learning: WestminsterSectionSummary | undefined;
    let review: WestminsterSectionSummary[] = [];
    if (state.catechism && questions?.length) {
      const p = catechismPlan(state.catechism, questions.length, log.length);
      learning = questions[p.learning];
      review = p.review.map((i) => questions[i]).filter(Boolean);
    }
    const everyone = familyPeople(people, state.prayerCategory);
    return {
      plan,
      day,
      planDone,
      readingTitle,
      psalm: state.singing ? (state.psalm?.number ?? null) : null,
      questions,
      learning,
      review,
      catechismDone: !!state.catechism && catechismFinished(state.catechism, questions?.length),
      catechismTitle: catechismDoc?.title ?? null,
      everyone,
      prayFor: longestUnprayed(everyone).slice(0, PRAY_FOR_COUNT),
    };
  }, [state, plans, days, questions, catechismDoc, people, log.length]);

  const gatheredToday = log.includes(localDate());

  const finish = useCallback(
    (unticked: number[]) => {
      if (!state || !tonight) return;
      const before = state;
      const logBefore = log;
      setState(afterGathering(state, { lengthDays: tonight.plan?.length_days, catechismTotal: tonight.questions?.length }));
      setLog([...log, localDate()]);
      const prayed = tonight.prayFor.filter((p) => !unticked.includes(p.id));
      for (const p of prayed) markPrayed.mutate(p.id);
      toast.success("Written down. Next time picks up where you left off.", {
        label: "Undo",
        onClick: () => {
          setState(before);
          setLog(logBefore);
          // The names prayed for go back to when they were last prayed for
          // before tonight, so they come up again next time.
          void Promise.all(prayed.map((p) => api.restorePrayerListPersonPrayed(p.id, p.last_prayed_at)))
            .catch(() => toast.error("Could not put back the prayer list."))
            .finally(() => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }));
        },
      });
    },
    [state, tonight, log, setState, setLog, markPrayed, qc],
  );

  return { state, setState, log, setLog, isLoaded: isLoaded && logLoaded, tonight, gatheredToday, finish, catechismDoc, docs };
}

/** A reading's verse ranges, one per chapter it touches: the passage lookup
 * takes a chapter at a time, and an open end (999) runs to the chapter's
 * last verse. */
export function readingRefs(r: { book_id: number; chapter_start: number; verse_start: number | null; chapter_end: number; verse_end: number | null }) {
  const refs = [];
  for (let c = r.chapter_start; c <= r.chapter_end; c++) {
    refs.push({
      book_id: r.book_id,
      chapter: c,
      verse_start: c === r.chapter_start ? (r.verse_start ?? 1) : 1,
      verse_end: c === r.chapter_end ? (r.verse_end ?? 999) : 999,
    });
  }
  return refs;
}
