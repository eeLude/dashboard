"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { getMovementProgress, type MovementProgressPoint } from "@/lib/queries";
import { formatSetLine } from "@/lib/utils";
import type { Movement } from "@/types/database";

const GRID = "#3f3f46";
const TICK = "#a1a1aa";
const BRAND = "#004cff";
const MUTED = "rgba(113, 113, 122, 0.45)";

const PINNED_LIFTS = [
  "Incline DB Bench Press",
  "Leg Press",
  "T-Bar Row",
  "RDL with Bar",
];

function sortMovements(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) => {
    const aPin = PINNED_LIFTS.indexOf(a.name);
    const bPin = PINNED_LIFTS.indexOf(b.name);
    if (aPin !== -1 && bPin !== -1) return aPin - bPin;
    if (aPin !== -1) return -1;
    if (bPin !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MovementProgressPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-zinc-200">{point.dateLabel}</p>
      <p className="font-semibold text-brand">Est. 1RM {point.estimated1RM} kg</p>
      <p className="mt-1 text-xs text-zinc-500">
        Best set {formatSetLine(point.topSet.weight_kg, point.topSet.reps)}
      </p>
      <p className="text-xs text-zinc-500">Top weight {point.topWeight} kg</p>
    </div>
  );
}

export function ProgressiveOverloadChart({
  movements,
}: {
  movements: Movement[];
}) {
  const sorted = sortMovements(movements);
  const defaultId =
    sorted.find((m) => m.name === "Incline DB Bench Press")?.id ??
    sorted[0]?.id ??
    "";

  const [selectedId, setSelectedId] = useState(defaultId);

  useEffect(() => {
    if (!selectedId && defaultId) setSelectedId(defaultId);
  }, [defaultId, selectedId]);

  const effectiveId = selectedId || defaultId;

  const { data: progress, isLoading } = useQuery({
    queryKey: ["movement-progress", effectiveId],
    queryFn: () => getMovementProgress(effectiveId!),
    enabled: !!effectiveId,
  });

  if (!movements.length) {
    return <p className="text-sm text-zinc-500">No movement history yet.</p>;
  }

  const latest = progress?.at(-1);

  return (
    <div>
      <select
        value={effectiveId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
      >
        {sorted.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      {latest && (
        <p className="mb-3 text-xs text-zinc-500">
          Latest est. 1RM:{" "}
          <span className="font-semibold text-brand">
            {latest.estimated1RM} kg
          </span>
          <span className="ml-2 text-zinc-600">
            · from {formatSetLine(latest.topSet.weight_kg, latest.topSet.reps)}
          </span>
        </p>
      )}
      <p className="mb-3 text-xs text-zinc-600">
        Estimated 1RM rises when you add reps at the same weight, so it tracks
        progress the top weight alone would hide.
      </p>

      {isLoading && (
        <p className="text-sm text-zinc-500">Loading chart...</p>
      )}

      {!isLoading && (!progress || progress.length === 0) && (
        <p className="text-sm text-zinc-500">
          No logged data for this movement.
        </p>
      )}

      {progress && progress.length > 0 && (
        <ChartContainer height={220}>
          <LineChart data={progress}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: TICK }}
            />
            <YAxis tick={{ fontSize: 11, fill: TICK }} unit="kg" width={42} />
            <Tooltip content={<ProgressTooltip />} />
            <Legend
              formatter={(value) =>
                value === "estimated1RM" ? "Est. 1RM" : "Top weight"
              }
            />
            <Line
              type="monotone"
              dataKey="estimated1RM"
              stroke={BRAND}
              strokeWidth={3}
              dot={{ r: 4, fill: BRAND }}
              name="estimated1RM"
            />
            <Line
              type="monotone"
              dataKey="topWeight"
              stroke={MUTED}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="topWeight"
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}
