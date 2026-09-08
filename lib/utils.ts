import { parseISO, subDays } from "date-fns";

/** Parse "65,5" or "65.5" into a number. Returns null if invalid. */
export function parseLocaleNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

/** Finnish-friendly display: 65.5 → "65,5", 8 → "8" */
export function formatLocaleNumber(
  value: number,
  maxDecimals: number
): string {
  const rounded =
    Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  const fixed = rounded.toFixed(maxDecimals);
  const trimmed =
    maxDecimals === 0
      ? fixed
      : fixed.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed.replace(".", ",");
}

/** Epley formula: estimated 1RM (reps capped at 12 — unreliable above that) */
export function calculateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  const effectiveReps = Math.min(reps, 12);
  return Math.round(weightKg * (1 + effectiveReps / 30) * 10) / 10;
}

/** Change from latest weight vs the most recent log on or before 7 days prior. */
export function getWeeklyWeightChange(
  logs: { date: string; weight: number }[]
): number | null {
  if (logs.length < 2) return null;
  const latest = logs.at(-1)!;
  const weekAgoIso = toDateString(subDays(parseISO(`${latest.date}T12:00:00`), 7));
  const prior = [...logs].reverse().find((l) => l.date <= weekAgoIso);
  if (!prior || prior.date === latest.date) return null;
  return Math.round((latest.weight - prior.weight) * 10) / 10;
}

export function formatSetLine(weightKg: number, reps: number): string {
  return `${formatLocaleNumber(weightKg, 2)} kg x ${formatLocaleNumber(reps, 1)} reps`;
}

export type SetPerformance = { weight_kg: number; reps: number };

export type ProgressChange = {
  label: string;
  direction: "up" | "down" | "neutral";
};

/** Best set in a session by estimated 1RM, so more reps at the same weight can
 *  win over a heavier low-rep set. Ties break on the heavier weight. */
export function pickBestSet(sets: SetPerformance[]): SetPerformance | null {
  if (sets.length === 0) return null;
  return sets.reduce((best, set) => {
    const setMax = calculateOneRepMax(set.weight_kg, set.reps);
    const bestMax = calculateOneRepMax(best.weight_kg, best.reps);
    if (setMax > bestMax) return set;
    if (setMax === bestMax && set.weight_kg > best.weight_kg) return set;
    return best;
  });
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function signedLocale(value: number, maxDecimals = 1): string {
  const abs = formatLocaleNumber(Math.abs(value), maxDecimals);
  return value < 0 ? `-${abs}` : `+${abs}`;
}

/** Session-over-session change for dashboard muscle cards. Direction follows
 *  estimated 1RM, so extra reps at the same weight register as progress. */
export function formatProgressChange(
  latest: SetPerformance,
  previous: SetPerformance
): ProgressChange | null {
  const weightDelta = roundTenth(latest.weight_kg - previous.weight_kg);
  const repDelta = roundTenth(latest.reps - previous.reps);
  if (weightDelta === 0 && repDelta === 0) return null;

  const oneRmDelta = roundTenth(
    calculateOneRepMax(latest.weight_kg, latest.reps) -
      calculateOneRepMax(previous.weight_kg, previous.reps)
  );
  const direction: ProgressChange["direction"] =
    oneRmDelta > 0 ? "up" : oneRmDelta < 0 ? "down" : "neutral";

  const absReps = Math.abs(repDelta);

  if (weightDelta !== 0) {
    if (repDelta !== 0) {
      return {
        label: `${signedLocale(weightDelta)} kg (${signedLocale(repDelta)} rep${absReps === 1 ? "" : "s"})`,
        direction,
      };
    }
    const pct =
      previous.weight_kg > 0
        ? roundTenth((weightDelta / previous.weight_kg) * 100)
        : 0;
    return {
      label: `${signedLocale(weightDelta)} kg (${signedLocale(pct)}%)`,
      direction,
    };
  }

  // Same weight, more/fewer reps: clean and simple without "e1RM" clutter
  return {
    label: `${signedLocale(repDelta)} rep${absReps === 1 ? "" : "s"}`,
    direction,
  };
}

export function isCardioMuscle(muscle: string): boolean {
  return muscle === "Cardio";
}

/** Run logs store duration in reps and distance (km) in weight_kg. */
export function formatCardioSetLine(distanceKm: number, durationMin: number): string {
  const parts = [`${formatLocaleNumber(durationMin, 1)} min`];
  if (distanceKm > 0) {
    parts.push(`${formatLocaleNumber(distanceKm, 2)} km`);
  }
  return parts.join(" · ");
}

/** Sanitize numeric input allowing both comma and dot, max one decimal separator. */
export function sanitizeDecimalInput(val: string): string {
  const allowed = val.replace(/[^0-9.,]/g, "");
  const firstSep = allowed.search(/[.,]/);
  if (firstSep === -1) return allowed;
  const before = allowed.slice(0, firstSep + 1);
  const after = allowed.slice(firstSep + 1).replace(/[.,]/g, "");
  return before + after;
}

/** Parse speed, elevation, and custom user note from auto-generated run notes. */
export function parseRunNote(rawNote: string | null | undefined): {
  speed: string;
  elevation: string;
  userNote: string;
} {
  if (!rawNote) return { speed: "", elevation: "", userNote: "" };

  const match = rawNote.match(/^(?:Treadmill|Run)\s*—\s*(.*?)(?:\.\s*([\s\S]*))?$/);
  if (!match) {
    return { speed: "", elevation: "", userNote: rawNote };
  }

  const metricsPart = match[1] ?? "";
  const remainingNote = (match[2] ?? "").trim();

  let speed = "";
  let elevation = "";

  const speedMatch = metricsPart.match(/([0-9]+(?:[.,][0-9]+)?)\s*kph/i);
  if (speedMatch) speed = speedMatch[1];

  const elevMatch = metricsPart.match(/([0-9]+(?:[.,][0-9]+)?)\s*%\s*elevation/i);
  if (elevMatch) elevation = elevMatch[1];

  if (!speed && !elevation) {
    return { speed: "", elevation: "", userNote: rawNote };
  }

  return { speed, elevation, userNote: remainingNote };
}

/** Pace as m:ss per km, e.g. 5.5 → "5:30". */
export function formatPace(minPerKm: number): string {
  const totalSec = Math.round(minPerKm * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/** Latest vs previous pace. Negative seconds = faster. */
export function formatPaceDelta(
  latestMinPerKm: number,
  previousMinPerKm: number
): { label: string; direction: "up" | "down" | "neutral" } {
  const deltaSec = Math.round((latestMinPerKm - previousMinPerKm) * 60);
  if (deltaSec === 0) {
    return { label: "0 s/km", direction: "neutral" };
  }
  const sign = deltaSec > 0 ? "+" : "−";
  return {
    label: `${sign}${Math.abs(deltaSec)} s/km`,
    direction: deltaSec < 0 ? "up" : "down",
  };
}

export function formatPreviousSets(
  sets: { weight_kg: number; reps: number }[],
  targetMuscle?: string
): string {
  if (sets.length === 0) return "No previous data";
  if (targetMuscle && isCardioMuscle(targetMuscle)) {
    const s = sets[0];
    return formatCardioSetLine(Number(s.weight_kg), s.reps);
  }
  return sets.map((s) => formatSetLine(Number(s.weight_kg), s.reps)).join(", ");
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 1 = Monday … 7 = Sunday (local calendar). */
export function getIsoWeekDay(date: Date = new Date()): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** Monday-start week keys, oldest first, including the current week. */
export function listMondayWeekStarts(
  weekCount: number,
  from: Date = new Date()
): string[] {
  const current = getWeekStart(from);
  const weeks: string[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(current.getDate() - i * 7);
    weeks.push(toDateString(d));
  }
  return weeks;
}

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
