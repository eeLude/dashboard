import { differenceInDays, parseISO, subDays } from "date-fns";
import {
  formatLocaleNumber,
  getWeeklyWeightChange,
  toDateString,
} from "@/lib/utils";
import type { UserProfile } from "@/types/database";

export type GoalType = Exclude<UserProfile["goal_type"], null>;

export const GOAL_TYPES: GoalType[] = ["bulk", "cut", "maintain"];

export const GOAL_LABELS: Record<GoalType, string> = {
  bulk: "Bulk",
  cut: "Cut",
  maintain: "Maintain",
};

/** Weekly % of body weight. Bulk/cut use the same 0.25–0.5% magnitude. */
export const GOAL_BANDS: Record<GoalType, { minPct: number; maxPct: number }> = {
  bulk: { minPct: 0.25, maxPct: 0.5 },
  cut: { minPct: -0.5, maxPct: -0.25 },
  maintain: { minPct: -0.25, maxPct: 0.25 },
};

export type RateStatus = "too_slow" | "on_track" | "too_fast";

export type WeeklyWeightRate = {
  kgPerWeek: number;
  pctPerWeek: number;
  currentWeight: number;
};

const MIN_SPAN_DAYS = 13;

function calendarWindowAverage(
  logs: { date: string; weight: number }[],
  endDate: string,
  windowDays = 7
): number | null {
  const end = parseISO(`${endDate}T12:00:00`);
  const startIso = toDateString(subDays(end, windowDays - 1));
  const inWindow = logs.filter(
    (l) => l.date >= startIso && l.date <= endDate
  );
  if (inWindow.length === 0) return null;
  const sum = inWindow.reduce((acc, l) => acc + l.weight, 0);
  return sum / inWindow.length;
}

export function hasEnoughWeightHistory(
  logs: { date: string; weight: number }[]
): boolean {
  if (logs.length < 2) return false;
  const first = parseISO(`${logs[0].date}T12:00:00`);
  const last = parseISO(`${logs[logs.length - 1].date}T12:00:00`);
  return differenceInDays(last, first) >= MIN_SPAN_DAYS;
}

/** 7-day calendar average now vs ~7 days earlier, as kg and % of current weight. */
export function getSmoothedWeeklyWeightRate(
  logs: { date: string; weight: number }[]
): WeeklyWeightRate | null {
  if (logs.length < 2) return null;

  const latest = logs.at(-1)!;
  const latestAvg = calendarWindowAverage(logs, latest.date);
  if (latestAvg == null) return null;

  const weekAgoIso = toDateString(
    subDays(parseISO(`${latest.date}T12:00:00`), 7)
  );
  const prior = [...logs].reverse().find((l) => l.date <= weekAgoIso);
  if (!prior || prior.date === latest.date) return null;

  const priorAvg = calendarWindowAverage(logs, prior.date);
  if (priorAvg == null) return null;

  const kgPerWeek = Math.round((latestAvg - priorAvg) * 100) / 100;
  const currentWeight = latest.weight;
  const pctPerWeek =
    currentWeight > 0
      ? Math.round((kgPerWeek / currentWeight) * 10000) / 100
      : 0;

  return { kgPerWeek, pctPerWeek, currentWeight };
}

export type WeightTrend = WeeklyWeightRate & {
  method: "smoothed" | "raw";
};

/** Single source for the weekly weight indicator, so the hub card and the gym
 *  card never show different numbers. Daily weight swings too much to read
 *  raw, so smooth over calendar weeks as soon as there is enough history. */
export function getWeightTrend(
  logs: { date: string; weight: number }[]
): WeightTrend | null {
  const smoothed = hasEnoughWeightHistory(logs)
    ? getSmoothedWeeklyWeightRate(logs)
    : null;
  if (smoothed) return { ...smoothed, method: "smoothed" };

  const raw = getWeeklyWeightChange(logs);
  if (raw == null) return null;

  const currentWeight = logs.at(-1)!.weight;
  return {
    kgPerWeek: raw,
    pctPerWeek:
      currentWeight > 0 ? Math.round((raw / currentWeight) * 10000) / 100 : 0,
    currentWeight,
    method: "raw",
  };
}

export function formatWeightTrend(trend: WeightTrend): string {
  return `${formatSignedKg(trend.kgPerWeek)} · ${formatSignedPct(
    trend.pctPerWeek
  )}/wk`;
}

/** Trend line value per point: the average of the surrounding calendar week.
 *  An entry-count window would drift to weeks or months wide when logging is
 *  irregular, which is why the two cards used to disagree. */
export function calendarRollingAverage(
  logs: { date: string; weight: number }[],
  windowDays = 7
): (number | null)[] {
  return logs.map((log) => {
    const avg = calendarWindowAverage(logs, log.date, windowDays);
    return avg == null ? null : Math.round(avg * 10) / 10;
  });
}

export function evaluateGoalRate(
  goal: GoalType,
  pctPerWeek: number
): RateStatus {
  const { minPct, maxPct } = GOAL_BANDS[goal];
  if (pctPerWeek < minPct) {
    return goal === "cut" ? "too_fast" : "too_slow";
  }
  if (pctPerWeek > maxPct) {
    return goal === "cut" ? "too_slow" : "too_fast";
  }
  return "on_track";
}

export function getGoalKgBand(
  goal: GoalType,
  weightKg: number
): { minKg: number; maxKg: number } {
  const { minPct, maxPct } = GOAL_BANDS[goal];
  return {
    minKg: Math.round(((weightKg * minPct) / 100) * 100) / 100,
    maxKg: Math.round(((weightKg * maxPct) / 100) * 100) / 100,
  };
}

export function formatSignedKg(value: number): string {
  const abs = formatLocaleNumber(Math.abs(value), 2);
  if (value > 0) return `+${abs} kg`;
  if (value < 0) return `-${abs} kg`;
  return `${abs} kg`;
}

export function formatSignedPct(value: number): string {
  const abs = formatLocaleNumber(Math.abs(value), 2);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `${abs}%`;
}

export function getGoalBandCopy(goal: GoalType): string {
  switch (goal) {
    case "bulk":
      return "Aim to gain 0.25–0.5% of body weight per week.";
    case "cut":
      return "Aim to lose 0.25–0.5% of body weight per week.";
    case "maintain":
      return "Aim to stay within ±0.25% of body weight per week.";
  }
}

export function getRateStatusCopy(
  goal: GoalType,
  status: RateStatus
): string {
  if (status === "on_track") {
    if (goal === "bulk") return "On track for a lean bulk";
    if (goal === "cut") return "On track for a cut";
    return "Weight is stable";
  }
  if (goal === "bulk") {
    return status === "too_slow"
      ? "Gaining too slowly"
      : "Gaining too fast";
  }
  if (goal === "cut") {
    return status === "too_slow"
      ? "Not losing enough"
      : "Losing too fast";
  }
  return status === "too_slow" ? "Losing weight" : "Gaining weight";
}

export function getRateStatusClass(status: RateStatus): string {
  if (status === "on_track") return "text-emerald-400";
  if (status === "too_slow") return "text-amber-400";
  return "text-orange-400";
}
