"use client";

import { formatFiDate } from "@/lib/dates";
import {
  DASHBOARD_MUSCLE_GROUPS,
  type DashboardMuscleGroup,
} from "@/lib/muscleGroups";
import type { MuscleGroupProgress, MovementProgressRow } from "@/lib/queries";
import { formatSetLine } from "@/lib/utils";

function ProgressRow({ row }: { row: MovementProgressRow }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{row.name}</p>
        <p className="text-xs text-zinc-500">{formatFiDate(row.latestDate)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm text-zinc-200">
          {formatSetLine(row.latestSet.weight_kg, row.latestSet.reps)}
        </p>
        {row.change && (
          <p
            className={
              row.change.direction === "up"
                ? "text-sm text-green-500"
                : row.change.direction === "down"
                  ? "text-sm text-red-400"
                  : "text-sm text-zinc-400"
            }
          >
            {row.change.label}
          </p>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  rows,
}: {
  group: DashboardMuscleGroup;
  rows: MovementProgressRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{group}</h3>
        <span className="text-xs text-zinc-500">
          {rows.length} exercise{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div>
        {rows.map((row) => (
          <ProgressRow key={row.movementId} row={row} />
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

  const hasAny = DASHBOARD_MUSCLE_GROUPS.some(
    (group) => (data[group]?.length ?? 0) > 0
  );

  if (!hasAny) {
    return (
      <p className="text-sm text-zinc-500">
        Log workouts to track progression by muscle group.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {DASHBOARD_MUSCLE_GROUPS.map((group) => (
        <GroupCard key={group} group={group} rows={data[group] ?? []} />
      ))}
    </div>
  );
}
