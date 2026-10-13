"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { useLocale } from "@/components/LocaleProvider";
import { formatFiDate, formatFiDateShort } from "@/lib/dates";
import {
  calendarRollingAverage,
  evaluateGoalRate,
  formatSignedKg,
  formatSignedPct,
  formatWeightTrend,
  getGoalKgBand,
  getRateStatusClass,
  getRateStatusCopy,
  getWeeklyWeightSummaries,
  getWeightTrend,
  type GoalType,
} from "@/lib/goals";
import { formatLocaleNumber } from "@/lib/utils";
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
  const { t, locale } = useLocale();
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

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

  const rawLogs = useMemo(() => {
    return logs
      .filter((l) => l.weight_kg != null)
      .map((l) => ({ date: l.date, weight: Number(l.weight_kg) }));
  }, [logs]);

  const weeklySummaries = useMemo(() => {
    return getWeeklyWeightSummaries(rawLogs, 12);
  }, [rawLogs]);

  const latest = chartData.at(-1)?.weight;
  const trend = getWeightTrend(chartData);

  // The goal bands are calibrated on smoothed multi-week rates
  const rate = trend?.method === "smoothed" ? trend : null;
  const status =
    goalType && rate
      ? evaluateGoalRate(goalType, rate.pctPerWeek)
      : null;
  const kgBand =
    goalType && latest != null ? getGoalKgBand(goalType, latest) : null;

  const currentWeek = weeklySummaries.find((w) => w.isCurrentWeek);
  const previousWeek = weeklySummaries.find((w) => !w.isCurrentWeek);

  if (!chartData.length) {
    return (
      <p className="text-sm text-zinc-500">
        {locale === "fi"
          ? "Kirjaa kehonpainoa alle nähdäksesi kehityksen."
          : "Log body weight below to track trends."}
      </p>
    );
  }

  return (
    <div>
      {latest != null && (
        <div className="mb-3 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">
                {t("gym.weight.latest", {
                  weight: formatLocaleNumber(latest, 1),
                })}
              </span>
              {trend != null && (
                <span className="ml-2 text-zinc-400">
                  · {formatWeightTrend(trend)}
                </span>
              )}
            </p>

            <div className="inline-flex rounded-lg bg-zinc-800/80 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("chart")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  viewMode === "chart"
                    ? "bg-zinc-700 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t("gym.weight.viewChart")}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  viewMode === "table"
                    ? "bg-zinc-700 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t("gym.weight.viewTable")}
              </button>
            </div>
          </div>

          {trend?.method !== "smoothed" && (
            <p className="text-xs text-zinc-500">
              {t("gym.weight.needHistory")}
            </p>
          )}

          {goalType == null && (
            <p className="text-xs text-zinc-500">
              {t("gym.weight.pickGoal")}
            </p>
          )}

          {goalType && status && rate && kgBand && (
            <p className={`text-xs ${getRateStatusClass(status)}`}>
              {getRateStatusCopy(goalType, status, t)}
              <span className="text-zinc-500">
                {" "}
                ·{" "}
                {t("gym.weight.aimRange", {
                  min: formatSignedKg(kgBand.minKg),
                  max: formatSignedKg(kgBand.maxKg),
                })}
              </span>
            </p>
          )}
        </div>
      )}

      {viewMode === "chart" ? (
        <div>
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
                  `${formatLocaleNumber(value, 2)} kg`,
                  name === "weightAvg"
                    ? locale === "fi"
                      ? "7 pv keskiarvo"
                      : "7-day avg"
                    : locale === "fi"
                    ? "Paino"
                    : "Weight",
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

          {(currentWeek || previousWeek) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-800/40 px-3 py-2 text-xs text-zinc-400">
              <div className="space-y-0.5">
                {currentWeek && (
                  <p>
                    <span className="text-zinc-300 font-medium">
                      {locale === "fi" ? "Tämä viikko:" : "This week:"}
                    </span>{" "}
                    {formatLocaleNumber(currentWeek.avgWeight, 1)} kg{" "}
                    <span className="text-zinc-500">
                      ({currentWeek.logCount} {locale === "fi" ? "pv" : "logs"},{" "}
                      {t("gym.weight.inProgress").toLowerCase()})
                    </span>
                  </p>
                )}
                {previousWeek && (
                  <p>
                    <span className="text-zinc-300 font-medium">
                      {locale === "fi" ? "Edellinen viikko:" : "Last week:"}
                    </span>{" "}
                    {formatLocaleNumber(previousWeek.avgWeight, 1)} kg
                    {previousWeek.changeKg != null && (
                      <span className="ml-1 text-zinc-400">
                        ({formatSignedKg(previousWeek.changeKg)})
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className="text-xs font-medium text-brand hover:underline"
              >
                {locale === "fi" ? "Avaa viikkotaulukko →" : "View weekly table →"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-800/50 text-zinc-400">
              <tr>
                <th className="px-3 py-2.5 font-medium">{t("gym.weight.tableWeek")}</th>
                <th className="px-3 py-2.5 font-medium">{t("gym.weight.tableAvg")}</th>
                <th className="px-3 py-2.5 font-medium">{t("gym.weight.tableChange")}</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  {t("gym.weight.tableLogs")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {weeklySummaries.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-zinc-500"
                  >
                    {t("gym.weight.noWeeklyData")}
                  </td>
                </tr>
              ) : (
                weeklySummaries.map((summary) => {
                  const rangeLabel = `${formatFiDateShort(
                    summary.weekStart
                  )}–${formatFiDateShort(summary.weekEnd)}`;

                  return (
                    <tr
                      key={summary.weekStart}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-200">
                            {locale === "fi" ? "Vko" : "W"}{" "}
                            {summary.weekNumber}
                          </span>
                          {summary.isCurrentWeek && (
                            <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                              {t("gym.weight.inProgress")}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          {rangeLabel}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-zinc-100">
                          {formatLocaleNumber(summary.avgWeight, 1)} kg
                        </span>
                        {summary.minWeight !== summary.maxWeight && (
                          <p className="text-[11px] text-zinc-500">
                            {formatLocaleNumber(summary.minWeight, 1)}–
                            {formatLocaleNumber(summary.maxWeight, 1)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {summary.changeKg != null ? (
                          <span
                            className={
                              summary.changeKg > 0
                                ? "text-emerald-400"
                                : summary.changeKg < 0
                                ? "text-amber-400"
                                : "text-zinc-400"
                            }
                          >
                            {formatSignedKg(summary.changeKg)}
                            {summary.changePct != null && (
                              <span className="ml-1 text-[11px] opacity-80">
                                ({formatSignedPct(summary.changePct)})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {summary.logCount}
                        <span className="text-zinc-500">/7 pv</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
