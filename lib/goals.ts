import { addDays, differenceInDays, getISOWeek, parseISO, subDays } from "date-fns";
import {
  formatLocaleNumber,
  getWeekStart,
  getWeeklyWeightChange,
  toDateString,
} from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";
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

const IDEAL_BASELINE_DAYS = 14;
const MIN_BASELINE_DAYS = 7;
const MAX_BASELINE_DAYS = 28;

/**
 * 7-day calendar average now vs ~14-21 days earlier (falling back to 7-13 days
 * if history is shorter), normalized by the elapsed number of weeks.
 *
 * Comparing over a 2-3 week span rather than a single 7-day step dampens daily
 * water/sodium/glycogen swings (which can easily be 0.5-1.5 kg) and prevents
 * spurious "gaining too fast" or "too slow" alerts from a single weigh-in.
 */
export function getSmoothedWeeklyWeightRate(
  logs: { date: string; weight: number }[]
): WeeklyWeightRate | null {
  if (logs.length < 2) return null;

  const latest = logs.at(-1)!;
  const latestAvg = calendarWindowAverage(logs, latest.date, 7);
  if (latestAvg == null) return null;

  const latestDate = parseISO(`${latest.date}T12:00:00`);
  const minBaselineIso = toDateString(subDays(latestDate, MIN_BASELINE_DAYS));

  // Eligible prior logs must be at least MIN_BASELINE_DAYS (7 days) earlier
  const eligiblePriors = logs.filter((l) => l.date <= minBaselineIso);
  if (eligiblePriors.length === 0) return null;

  // Prefer a baseline around IDEAL_BASELINE_DAYS (14 days ago) within MAX_BASELINE_DAYS (28)
  let prior = eligiblePriors[0];
  let minDiffFromTarget = Infinity;
  for (const l of eligiblePriors) {
    const d = parseISO(`${l.date}T12:00:00`);
    const daysFromLatest = differenceInDays(latestDate, d);
    if (daysFromLatest > MAX_BASELINE_DAYS) continue;
    const diff = Math.abs(daysFromLatest - IDEAL_BASELINE_DAYS);
    if (diff < minDiffFromTarget) {
      minDiffFromTarget = diff;
      prior = l;
    }
  }

  // Fallback to the latest eligible prior if none were within MAX_BASELINE_DAYS
  if (minDiffFromTarget === Infinity) {
    prior = eligiblePriors.at(-1)!;
  }

  const priorAvg = calendarWindowAverage(logs, prior.date, 7);
  if (priorAvg == null) return null;

  const priorDate = parseISO(`${prior.date}T12:00:00`);
  const daysBetween = differenceInDays(latestDate, priorDate);
  if (daysBetween < MIN_BASELINE_DAYS) return null;

  const elapsedWeeks = daysBetween / 7;
  const kgPerWeek =
    Math.round(((latestAvg - priorAvg) / elapsedWeeks) * 100) / 100;
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

/** Tolerance margin around target weekly percentage to avoid threshold jitter on daily water shifts. */
export const GOAL_TOLERANCE_PCT = 0.05;

export function evaluateGoalRate(
  goal: GoalType,
  pctPerWeek: number
): RateStatus {
  const { minPct, maxPct } = GOAL_BANDS[goal];
  if (pctPerWeek < minPct - GOAL_TOLERANCE_PCT) {
    return goal === "cut" ? "too_fast" : "too_slow";
  }
  if (pctPerWeek > maxPct + GOAL_TOLERANCE_PCT) {
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

export function getRateStatusKey(
  goal: GoalType,
  status: RateStatus
): MessageKey {
  if (status === "on_track") {
    if (goal === "bulk") return "gym.weight.status.bulk.onTrack";
    if (goal === "cut") return "gym.weight.status.cut.onTrack";
    return "gym.weight.status.maintain.onTrack";
  }
  if (goal === "bulk") {
    return status === "too_slow"
      ? "gym.weight.status.bulk.tooSlow"
      : "gym.weight.status.bulk.tooFast";
  }
  if (goal === "cut") {
    return status === "too_slow"
      ? "gym.weight.status.cut.tooSlow"
      : "gym.weight.status.cut.tooFast";
  }
  return status === "too_slow"
    ? "gym.weight.status.maintain.tooSlow"
    : "gym.weight.status.maintain.tooFast";
}

export function getRateStatusCopy(
  goal: GoalType,
  status: RateStatus,
  t?: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  if (t) {
    return t(getRateStatusKey(goal, status));
  }
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

export type WeeklyWeightSummary = {
  weekStart: string; // ISO Monday date (YYYY-MM-DD)
  weekEnd: string; // ISO Sunday date (YYYY-MM-DD)
  weekNumber: number; // ISO week number
  year: number;
  avgWeight: number; // rounded to 1 decimal place (e.g. 82.4)
  avgWeightPrecise: number; // rounded to 2 decimal places
  minWeight: number;
  maxWeight: number;
  logCount: number; // number of weigh-ins this week (1..7)
  changeKg: number | null; // vs previous logged week
  changePct: number | null; // vs previous logged week
  isCurrentWeek: boolean;
};

/**
 * Groups weight logs by Monday–Sunday calendar week and computes
 * weekly average weights, week-over-week deltas, and weigh-in counts.
 * Returns newest week first.
 */
export function getWeeklyWeightSummaries(
  logs: { date: string; weight: number }[],
  maxWeeks = 12
): WeeklyWeightSummary[] {
  if (logs.length === 0) return [];

  const currentMonday = toDateString(getWeekStart(new Date()));

  const weeksMap = new Map<string, { date: string; weight: number }[]>();

  for (const log of logs) {
    if (log.weight == null || Number.isNaN(log.weight)) continue;
    const logDate = parseISO(`${log.date}T12:00:00`);
    const monday = toDateString(getWeekStart(logDate));
    const list = weeksMap.get(monday) ?? [];
    list.push(log);
    weeksMap.set(monday, list);
  }

  const sortedMondays = Array.from(weeksMap.keys()).sort();
  const rawSummaries: WeeklyWeightSummary[] = [];

  for (let i = 0; i < sortedMondays.length; i++) {
    const mondayStr = sortedMondays[i];
    const weekLogs = weeksMap.get(mondayStr)!;
    const mondayDate = parseISO(`${mondayStr}T12:00:00`);
    const sundayDate = addDays(mondayDate, 6);
    const sundayStr = toDateString(sundayDate);

    const sum = weekLogs.reduce((acc, l) => acc + l.weight, 0);
    const count = weekLogs.length;
    const avgWeightPrecise = sum / count;
    const avgWeight = Math.round(avgWeightPrecise * 10) / 10;
    const minWeight = Math.min(...weekLogs.map((l) => l.weight));
    const maxWeight = Math.max(...weekLogs.map((l) => l.weight));

    const isCurrentWeek = mondayStr === currentMonday;
    const weekNumber = getISOWeek(mondayDate);
    const year = mondayDate.getFullYear();

    rawSummaries.push({
      weekStart: mondayStr,
      weekEnd: sundayStr,
      weekNumber,
      year,
      avgWeight,
      avgWeightPrecise: Math.round(avgWeightPrecise * 100) / 100,
      minWeight,
      maxWeight,
      logCount: count,
      changeKg: null,
      changePct: null,
      isCurrentWeek,
    });
  }

  // Calculate change vs previous logged week
  for (let i = 1; i < rawSummaries.length; i++) {
    const prev = rawSummaries[i - 1];
    const curr = rawSummaries[i];
    const delta =
      Math.round((curr.avgWeightPrecise - prev.avgWeightPrecise) * 100) / 100;
    curr.changeKg = delta;
    curr.changePct =
      prev.avgWeightPrecise > 0
        ? Math.round((delta / prev.avgWeightPrecise) * 10000) / 100
        : 0;
  }

  // Return limited to maxWeeks, newest week first
  return rawSummaries.slice(-maxWeeks).reverse();
}
