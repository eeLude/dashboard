"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { formatFiDate } from "@/lib/dates";
import { calendarRollingAverage } from "@/lib/goals";
import type { HealthLog } from "@/types/database";

const GRID = "#3f3f46";
const TICK = "#a1a1aa";

export function HealthTrendChart({ logs }: { logs: HealthLog[] }) {
  const chartData = useMemo(() => {
    const weighed = logs
      .filter((l) => l.weight_kg != null)
      .map((l) => ({ date: l.date, weight: Number(l.weight_kg) }));
    const avgs = calendarRollingAverage(weighed);
    const avgByDate = new Map(weighed.map((w, i) => [w.date, avgs[i]]));

    return logs.map((log) => ({
      dateLabel: formatFiDate(log.date),
      weight: log.weight_kg != null ? Number(log.weight_kg) : null,
      weightAvg: avgByDate.get(log.date) ?? null,
      calories: log.calories,
    }));
  }, [logs]);

  if (!logs.length) {
    return (
      <p className="text-sm text-zinc-500">
        Log weight & calories to see trends.
      </p>
    );
  }

  return (
    <ChartContainer height={240}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: TICK }} />
        <YAxis
          yAxisId="weight"
          orientation="left"
          tick={{ fontSize: 11, fill: TICK }}
          domain={["auto", "auto"]}
          unit="kg"
        />
        <YAxis
          yAxisId="calories"
          orientation="right"
          tick={{ fontSize: 11, fill: TICK }}
          unit="kcal"
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            fontSize: 13,
            backgroundColor: "#27272a",
            borderColor: "#3f3f46",
            color: "#fafafa",
          }}
        />
        <Legend />
        <Bar
          yAxisId="calories"
          dataKey="calories"
          fill="#52525b"
          name="Calories"
          radius={[3, 3, 0, 0]}
        />
        <Line
          yAxisId="weight"
          type="monotone"
          dataKey="weight"
          stroke="#004cff"
          strokeWidth={2}
          dot={{ r: 2 }}
          name="Weight"
          connectNulls
        />
        <Line
          yAxisId="weight"
          type="monotone"
          dataKey="weightAvg"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          name="7-day avg"
          connectNulls
        />
      </ComposedChart>
    </ChartContainer>
  );
}
