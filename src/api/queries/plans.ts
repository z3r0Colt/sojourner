// Reading plans and the reader's progress through them.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { PlanReadingInput, ScheduleEntry } from "../types";

export function useReadingPlans() {
  return useQuery({ queryKey: ["readingPlans"], queryFn: api.listReadingPlans, staleTime: Infinity });
}

export function useReadingPlanDays(planCode: string | null) {
  return useQuery({
    queryKey: ["readingPlanDays", planCode],
    queryFn: () => api.getReadingPlanDays(planCode!),
    enabled: planCode != null,
    staleTime: Infinity,
  });
}

export function useReadingPlanProgressList() {
  return useQuery({ queryKey: ["readingPlanProgress"], queryFn: api.listReadingPlanProgress });
}

export function useStartReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; startDate: string }) => api.startReadingPlan(input.planCode, input.startDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useAbandonReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.abandonReadingPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useMarkReadingPlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number }) => api.markReadingPlanDay(input.planCode, input.dayNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useUnmarkReadingPlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number }) => api.unmarkReadingPlanDay(input.planCode, input.dayNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F3.3): "Shift my schedule". */
export function useShiftReadingPlanStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; days: number }) => api.shiftReadingPlanStart(input.planCode, input.days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F3.3): "Skip to today" and its undo. */
export function useSetReadingPlanDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumbers: number[]; done: boolean }) => api.setReadingPlanDays(input.planCode, input.dayNumbers, input.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

// Custom plans (F4.2)

export interface UserPlanInput {
  title: string;
  description?: string;
  weekdays: number[] | null;
  days: PlanReadingInput[][];
}

export function useCreateUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserPlanInput) => api.createUserReadingPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlans"] }),
  });
}

export function useUpdateUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string } & UserPlanInput) => api.updateUserReadingPlan(input.planCode, input),
    onSuccess: (_plan, input) => {
      qc.invalidateQueries({ queryKey: ["readingPlans"] });
      qc.invalidateQueries({ queryKey: ["readingPlanDays", input.planCode] });
      qc.invalidateQueries({ queryKey: ["readingPlanProgress"] });
    },
  });
}

export function useDeleteUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteUserReadingPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["readingPlans"] });
      qc.invalidateQueries({ queryKey: ["readingPlanProgress"] });
    },
  });
}

/** Catch-up (F4.2): "Shift my schedule" for every kind of plan. */
export function useReanchorReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number; date: string }) => api.reanchorReadingPlan(input.planCode, input.dayNumber, input.date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F4.2): "Spread over seven days". */
export function useSpreadReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; today: string; window?: number }) => api.spreadReadingPlan(input.planCode, input.today, input.window),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** The undo of a spread: puts the captured schedule rows back. */
export function useSetReadingPlanSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; entries: ScheduleEntry[] }) => api.setReadingPlanSchedule(input.planCode, input.entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}
