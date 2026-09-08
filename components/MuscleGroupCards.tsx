"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { formatFiDate } from "@/lib/dates";
import {
  DASHBOARD_MUSCLE_GROUPS,
  type DashboardMuscleGroup,
} from "@/lib/muscleGroups";
import type { MuscleGroupProgress, MovementProgressRow } from "@/lib/queries";
import { formatSetLine } from "@/lib/utils";

const GROUP_NAMES: Record<DashboardMuscleGroup, { en: string; fi: string }> = {
  Chest: { en: "Chest", fi: "Rinta" },
  Back: { en: "Back", fi: "Selkä" },
  Legs: { en: "Legs", fi: "Jalat" },
  "Shoulders & Arms": { en: "Shoulders & Arms", fi: "Olkapäät & Kädet" },
};

function formatRelativeDays(iso: string, locale: "en" | "fi"): string {
  try {
    const diff = differenceInCalendarDays(new Date(), parseISO(iso));
    if (diff === 0) return locale === "fi" ? "Tänään" : "Today";
    if (diff === 1) return locale === "fi" ? "Eilen" : "Yesterday";
    if (diff === 2) return locale === "fi" ? "Toissapäivänä" : "2d ago";
    if (diff < 7) return locale === "fi" ? `${diff} pv sitten` : `${diff}d ago`;
    if (diff < 14) return locale === "fi" ? "Viikko sitten" : "1w ago";
    if (diff < 30) {
      const weeks = Math.floor(diff / 7);
      return locale === "fi" ? `${weeks} vkoa sitten` : `${weeks}w ago`;
    }
  } catch {}
  return formatFiDate(iso);
}

function ProgressRow({
  row,
  locale,
}: {
  row: MovementProgressRow;
  locale: "en" | "fi";
}) {
  const isUp = row.change?.direction === "up";
  const isDown = row.change?.direction === "down";

  return (
    <div className="flex flex-col gap-1.5 border-b border-zinc-800/80 py-3 last:border-0">
      {/* Top line: Movement name & clean change badge */}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-zinc-100">{row.name}</p>

        {row.change ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isUp
                ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : isDown
                  ? "border border-rose-500/30 bg-rose-500/15 text-rose-400"
                  : "border border-zinc-700/60 bg-zinc-800 text-zinc-400"
            }`}
          >
            {isUp ? "▲ " : isDown ? "▼ " : "– "}
            {row.change.label}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
            {locale === "fi" ? "Uusi liike" : "New"}
          </span>
        )}
      </div>

      {/* Bottom line: Relative date & Previous ➔ Latest comparison */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">
          {formatRelativeDays(row.latestDate, locale)}
        </span>

        <div className="flex items-center gap-1.5 text-xs">
          {row.previousSet ? (
            <>
              <span className="text-zinc-500 font-mono">
                {formatSetLine(row.previousSet.weight_kg, row.previousSet.reps)}
              </span>
              <span className="text-zinc-600">➔</span>
              <span className="font-semibold text-zinc-200 font-mono">
                {formatSetLine(row.latestSet.weight_kg, row.latestSet.reps)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-zinc-200 font-mono">
              {formatSetLine(row.latestSet.weight_kg, row.latestSet.reps)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  rows,
  locale,
}: {
  group: DashboardMuscleGroup;
  rows: MovementProgressRow[];
  locale: "en" | "fi";
}) {
  if (rows.length === 0) return null;

  const groupLabel = GROUP_NAMES[group]?.[locale] ?? group;

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
          {groupLabel}
        </h3>
        <span className="text-xs text-zinc-500">
          {rows.length} {locale === "fi" ? "liikettä" : rows.length === 1 ? "exercise" : "exercises"}
        </span>
      </div>
      <div>
        {rows.map((row) => (
          <ProgressRow key={row.movementId} row={row} locale={locale} />
        ))}
      </div>
    </div>
  );
}

export function MuscleGroupCards({
  data,
  isLoading,
}: {
  data: MuscleGroupProgress | undefined;
  isLoading: boolean;
}) {
  const { locale } = useLocale();
  const [selectedGroup, setSelectedGroup] = useState<"all" | DashboardMuscleGroup>("all");

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading muscle progress...</p>;
  }

  if (!data) {
    return (
      <p className="text-sm text-zinc-500">
        Log workouts to track progression by muscle group.
      </p>
    );
  }

  const activeGroups = DASHBOARD_MUSCLE_GROUPS.filter(
    (group) => (data[group]?.length ?? 0) > 0
  );

  if (activeGroups.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Log workouts to track progression by muscle group.
      </p>
    );
  }

  const groupsToRender =
    selectedGroup === "all"
      ? activeGroups
      : activeGroups.filter((g) => g === selectedGroup);

  return (
    <div className="space-y-3">
      {/* Muscle Group Filter Pills */}
      {activeGroups.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedGroup("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedGroup === "all"
                ? "bg-zinc-700 text-zinc-100 shadow-sm"
                : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {locale === "fi" ? "Kaikki" : "All"}
          </button>
          {activeGroups.map((group) => {
            const active = selectedGroup === group;
            const label = GROUP_NAMES[group]?.[locale] ?? group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setSelectedGroup(group)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-zinc-700 text-zinc-100 shadow-sm"
                    : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label} ({data[group]?.length ?? 0})
              </button>
            );
          })}
        </div>
      )}

      {/* Cards List */}
      <div className="space-y-3">
        {groupsToRender.map((group) => (
          <GroupCard
            key={group}
            group={group}
            rows={data[group] ?? []}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}
