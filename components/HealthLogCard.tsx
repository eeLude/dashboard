"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLocale } from "@/components/LocaleProvider";
import {
  deleteHealthLog,
  getHealthLogs,
  getUserProfile,
  upsertHealthLog,
  upsertUserGoal,
  HEALTH_LOG_DAYS,
} from "@/lib/queries";
import { formatFiDate, toDateString } from "@/lib/dates";
import {
  GOAL_LABELS,
  GOAL_TYPES,
  getGoalBandCopy,
  type GoalType,
} from "@/lib/goals";
import { formatLocaleNumber, parseLocaleNumber } from "@/lib/utils";

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function HealthLogCard() {
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const today = toDateString(new Date());

  const [selectedDate, setSelectedDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [calories, setCalories] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["health-logs", HEALTH_LOG_DAYS],
    queryFn: () => getHealthLogs(HEALTH_LOG_DAYS),
  });

  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: getUserProfile,
  });

  const selectedLog = useMemo(() => {
    return (logs ?? []).find((l) => l.date === selectedDate);
  }, [logs, selectedDate]);

  useEffect(() => {
    if (selectedLog) {
      setWeight(
        selectedLog.weight_kg != null
          ? formatLocaleNumber(Number(selectedLog.weight_kg), 2)
          : ""
      );
      setCalories(
        selectedLog.calories != null ? String(selectedLog.calories) : ""
      );
    } else {
      setWeight("");
      setCalories("");
    }
  }, [selectedLog, selectedDate]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertHealthLog(
        selectedDate,
        weight ? parseLocaleNumber(weight) : null,
        calories ? parseInt(calories, 10) : null
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-today"] });
      queryClient.invalidateQueries({ queryKey: ["health-logs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHealthLog(selectedDate),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      setWeight("");
      setCalories("");
      queryClient.invalidateQueries({ queryKey: ["health-today"] });
      queryClient.invalidateQueries({ queryKey: ["health-logs"] });
    },
  });

  const goalMutation = useMutation({
    mutationFn: (goalType: GoalType) => upsertUserGoal(goalType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });

  const selectedGoal = profile?.goal_type ?? null;
  const isToday = selectedDate === today;
  const canGoNext = selectedDate < today;

  const recentLogs = useMemo(() => {
    return [...(logs ?? [])]
      .filter((l) => l.weight_kg != null || l.calories != null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Goal</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {selectedGoal
              ? getGoalBandCopy(selectedGoal)
              : "Choose a goal so weight change can be judged."}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GOAL_TYPES.map((goal) => {
            const active = selectedGoal === goal;
            return (
              <button
                key={goal}
                type="button"
                disabled={goalMutation.isPending}
                onClick={() => goalMutation.mutate(goal)}
                className={`rounded-xl border py-2.5 text-sm font-medium disabled:opacity-60 transition ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {GOAL_LABELS[goal]}
              </button>
            );
          })}
        </div>
        {goalMutation.isError && (
          <p className="text-sm text-red-400">
            {goalMutation.error instanceof Error
              ? goalMutation.error.message
              : "Could not save goal."}
          </p>
        )}
      </div>

      {/* Date Navigator & Picker */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800 active:scale-95 transition"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
              disabled={!canGoNext}
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="relative flex items-center">
            <label className="flex items-center gap-1.5 cursor-pointer rounded-lg px-2.5 py-1 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition">
              <Calendar className="h-4 w-4 text-brand" />
              <span>
                {isToday
                  ? locale === "fi"
                    ? "Tänään"
                    : "Today"
                  : formatFiDate(selectedDate)}
              </span>
              <input
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value && e.target.value <= today) {
                    setSelectedDate(e.target.value);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>

          {!isToday ? (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-brand hover:bg-zinc-700 transition"
            >
              {locale === "fi" ? "Tänään" : "Today"}
            </button>
          ) : (
            <span className="text-xs font-medium text-zinc-500 px-2 py-1">
              {formatFiDate(today)}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {selectedLog
              ? locale === "fi"
                ? "Kirjaus olemassa (muokkaustila)"
                : "Existing log (editing)"
              : locale === "fi"
              ? "Ei kirjausta tälle päivälle"
              : "No log for this date"}
          </span>
          {selectedLog && (
            <span className="font-medium text-brand">
              {selectedLog.weight_kg != null
                ? `${formatLocaleNumber(Number(selectedLog.weight_kg), 1)} kg`
                : ""}
              {selectedLog.calories != null
                ? ` · ${selectedLog.calories} kcal`
                : ""}
            </span>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-300">
          Body Weight (kg)
        </span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="e.g. 82,5"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-lg text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-300">
          Total Calories
        </span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="e.g. 2800"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-lg text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-60 active:scale-[0.99] transition shadow-md shadow-brand/20"
        >
          <Save className="h-5 w-5" />
          {saveMutation.isPending
            ? locale === "fi"
              ? "Tallennetaan..."
              : "Saving..."
            : isToday
            ? locale === "fi"
              ? "Tallenna tämä päivä"
              : "Save Today"
            : locale === "fi"
            ? `Tallenna (${formatFiDate(selectedDate)})`
            : `Save (${formatFiDate(selectedDate)})`}
        </button>

        {selectedLog && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
            className="flex items-center justify-center rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3.5 text-red-400 hover:bg-red-950/40 disabled:opacity-50 transition"
            aria-label="Delete log for this date"
            title={locale === "fi" ? "Poista kirjaus" : "Delete log"}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>

      {saveMutation.isSuccess && (
        <p className="text-center text-sm text-emerald-400">
          {locale === "fi" ? "Tallennettu!" : "Saved!"}
        </p>
      )}

      {saveMutation.isError && (
        <p className="text-center text-sm text-red-400">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Failed to save. Check your connection and try again."}
        </p>
      )}

      {deleteMutation.isError && (
        <p className="text-center text-sm text-red-400">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : "Failed to delete. Check your connection."}
        </p>
      )}

      {/* Recent Logs Table */}
      {recentLogs.length > 0 && (
        <div className="mt-5 border-t border-zinc-800/80 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {locale === "fi"
                ? "Viimeisimmät kirjaukset (valitse muokattavaksi)"
                : "Recent logs (tap to edit)"}
            </h4>
            <span className="text-[11px] text-zinc-500">
              {recentLogs.length} {locale === "fi" ? "kpl" : "entries"}
            </span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {recentLogs.map((log) => {
              const isSelected = log.date === selectedDate;
              return (
                <button
                  key={log.date}
                  type="button"
                  onClick={() => setSelectedDate(log.date)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? "border border-brand bg-brand/15 text-white font-medium shadow-sm"
                      : "border border-zinc-800/60 bg-zinc-850/40 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isSelected ? "text-brand font-semibold" : "text-zinc-400"
                      }
                    >
                      {formatFiDate(log.date)}
                    </span>
                    {log.date === today && (
                      <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        {locale === "fi" ? "Tänään" : "Today"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {log.weight_kg != null ? (
                      <span className="font-medium text-zinc-200">
                        {formatLocaleNumber(Number(log.weight_kg), 1)} kg
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                    {log.calories != null ? (
                      <span className="text-zinc-400">
                        {log.calories} kcal
                      </span>
                    ) : null}
                    <span
                      className={`text-sm ${
                        isSelected ? "text-brand font-bold" : "text-zinc-500"
                      }`}
                    >
                      {isSelected ? "●" : "✎"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title={locale === "fi" ? "Poistetaanko kirjaus?" : "Delete health log?"}
        message={
          locale === "fi"
            ? `Haluatko varmasti poistaa päivän ${formatFiDate(selectedDate)} paino- ja kaloritiedot?`
            : `Are you sure you want to delete the weight and calorie log for ${formatFiDate(selectedDate)}?`
        }
        confirmLabel={locale === "fi" ? "Poista" : "Delete"}
        cancelLabel={locale === "fi" ? "Peruuta" : "Cancel"}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
