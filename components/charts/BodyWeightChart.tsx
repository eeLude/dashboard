"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { formatFiDate } from "@/lib/dates";
import {
  calendarRollingAverage,
  evaluateGoalRate,
  formatSignedKg,
  formatWeightTrend,
  getGoalKgBand,
  getRateStatusClass,
  getRateStatusCopy,
  getWeightTrend,
  type GoalType,
} from "@/lib/goals";
import type { HealthLog } from "@/types/database";

const GRID = "#3f3f46";
const TICK = "#a1a1aa";

export function BodyWeightChart({
  logs,
  goalType,
}: {
  logs: HealthLog[];
  goalType: GoalType | null;
}) {
  const chartData = useMemo(() => {
    const withWeight = logs
      .filter((l) => l.weight_kg != null)
      .map((log) => ({
        date: log.date,
        dateLabel: formatFiDate(log.date),
        weight: Number(log.weight_kg),
      }));
    const avgWeights = calendarRollingAverage(withWeight);

    return withWeight.map((row, i) => ({
      ...row,
      weightAvg: avgWeights[i],
    }));
  }, [logs]);

  const latest = chartData.at(-1)?.weight;
  const trend = getWeightTrend(chartData);
  // The goal bands are calibrated on smoothed rates, so a raw week-over-week
  // delta is too noisy to judge against them.
  const rate = trend?.method === "smoothed" ? trend : null;
  const status =
    goalType && rate
      ? evaluateGoalRate(goalType, rate.pctPerWeek)
      : null;
  const kgBand =
    goalType && latest != null ? getGoalKgBand(goalType, latest) : null;

  if (!chartData.length) {
    return (
      <p className="text-sm text-zinc-500">
        Log body weight below to track trends.
      </p>
    );
  }

  return (
    <div>
      {latest != null && (
        <div className="mb-3 space-y-1">
          <p className="text-sm text-zinc-400">
            <span className="text-zinc-300">Latest {latest} kg</span>
            {trend != null && (
              <span className="ml-2">· {formatWeightTrend(trend)}</span>
            )}
          </p>
          {trend?.method !== "smoothed" && (
            <p className="text-xs text-zinc-500">
              Need about 2 weeks of logs to judge rate.
            </p>
          )}
          {goalType == null && (
            <p className="text-xs text-zinc-500">
              Pick Bulk, Cut, or Maintain when logging weight so we can judge
              if you are on track.
            </p>
          )}
          {goalType && status && rate && kgBand && (
            <p className={`text-xs ${getRateStatusClass(status)}`}>
              {getRateStatusCopy(goalType, status)}
              <span className="text-zinc-500">
                {" "}
                · Aim {formatSignedKg(kgBand.minKg)} to{" "}
                {formatSignedKg(kgBand.maxKg)}/wk
              </span>
            </p>
          )}
        </div>
      )}
      <ChartContainer height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: TICK }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: TICK }}
            domain={["auto", "auto"]}
            unit="kg"
            width={42}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              fontSize: 13,
              backgroundColor: "#27272a",
              borderColor: "#3f3f46",
              color: "#fafafa",
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as
                | { dateLabel?: string }
                | undefined;
              return row?.dateLabel ?? "";
            }}
            formatter={(value: number, name: string) => [
              `${value} kg`,
              name === "weightAvg" ? "7-day avg" : "Weight",
            ]}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#004cff"
            strokeWidth={2}
            dot={false}
            name="weight"
          />
          <Line
            type="monotone"
            dataKey="weightAvg"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="weightAvg"
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
