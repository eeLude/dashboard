"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SaveStatusText } from "@/components/workout/SaveStatusText";
import {
  getAllMovements,
  getPreviousMovementPerformance,
  getSplitTemplate,
  invalidateWorkoutDashboardQueries,
} from "@/lib/queries";
import { useRunAutosave } from "@/lib/useActiveWorkout";
import { formatFiDate } from "@/lib/dates";
import {
  formatCardioSetLine,
  formatLocaleNumber,
  formatPreviousSets,
  parseLocaleNumber,
  parseRunNote,
  sanitizeDecimalInput,
} from "@/lib/utils";

const RUN_MOVEMENTS = ["Treadmill Run", "Outdoor Run"];

function buildRunNote(
  speed: string,
  elevation: string,
  movementName: string,
  userNote: string
): string | null {
  const parts: string[] = [];
  if (speed.trim()) parts.push(`${speed.trim()} kph`);
  if (elevation.trim()) parts.push(`${elevation.trim()}% elevation`);

  let auto = "";
  if (parts.length) {
    const prefix = movementName.includes("Treadmill") ? "Treadmill" : "Run";
    auto = `${prefix} — ${parts.join(" @ ")}`;
  }

  const trimmed = userNote.trim();
  if (trimmed && auto) return `${auto}. ${trimmed}`;
  return trimmed || auto || null;
}

export function RunWorkoutForm({
  splitId,
  workoutDate,
}: {
  splitId: string;
  workoutDate: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const templateQuery = useQuery({
    queryKey: ["split-template", splitId],
    queryFn: () => getSplitTemplate(splitId),
  });

  const movementsQuery = useQuery({
    queryKey: ["movements"],
    queryFn: getAllMovements,
  });

  const runMovements =
    movementsQuery.data?.filter((m) => RUN_MOVEMENTS.includes(m.name)) ?? [];

  const [movementId, setMovementId] = useState<string>("");
  const selectedMovementId = movementId || runMovements[0]?.id || "";
  const selectedMovement =
    runMovements.find((m) => m.id === selectedMovementId) ?? runMovements[0];

  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [speed, setSpeed] = useState("");
  const [elevation, setElevation] = useState("");
  const [note, setNote] = useState("");
  const [resumeApplied, setResumeApplied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const slot = templateQuery.data?.[0];
  const buildNote = useCallback(
    () =>
      buildRunNote(
        speed,
        elevation,
        selectedMovement?.name ?? "",
        note
      ),
    [speed, elevation, selectedMovement?.name, note]
  );

  const autosave = useRunAutosave({
    splitId,
    workoutDate,
    slotId: slot?.id ?? null,
    movementId: selectedMovementId,
    movementName: selectedMovement?.name ?? "Run",
    targetMuscle: selectedMovement?.target_muscle ?? "Cardio",
    duration,
    distance,
    speed,
    elevation,
    note,
    buildNote,
    templateReady: !!templateQuery.data && !!selectedMovementId,
  });

  useEffect(() => {
    if (!autosave.resumeData || resumeApplied) return;
    setDuration(autosave.resumeData.duration);
    setDistance(autosave.resumeData.distance);
    setSpeed(autosave.resumeData.speed);
    setElevation(autosave.resumeData.elevation);
    setNote(autosave.resumeData.note);
    setMovementId(autosave.resumeData.movementId);
    setResumeApplied(true);
  }, [autosave.resumeData, resumeApplied]);

  const { data: previous, isLoading: previousLoading } = useQuery({
    queryKey: [
      "previous-performance",
      selectedMovementId,
      autosave.sessionId,
      workoutDate,
    ],
    queryFn: () =>
      getPreviousMovementPerformance(selectedMovementId, {
        excludeSessionId: autosave.sessionId,
        beforeDate: workoutDate,
      }),
    enabled: !!selectedMovementId,
  });

  const copyLastSession = () => {
    if (!previous?.sets.length) return;
    const last = previous.sets[0];
    setDuration(last.reps ? formatLocaleNumber(last.reps, 1) : "");
    setDistance(last.weight_kg > 0 ? formatLocaleNumber(last.weight_kg, 2) : "");
    const parsed = parseRunNote(previous.note);
    setSpeed(parsed.speed);
    setElevation(parsed.elevation);
    setNote(parsed.userNote);
  };

  const finishMutation = useMutation({
    mutationFn: () => autosave.finishRun(),
    onSuccess: async () => {
      await invalidateWorkoutDashboardQueries(queryClient);
      router.push("/gym");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => autosave.deleteRun(),
    onSuccess: async () => {
      await invalidateWorkoutDashboardQueries(queryClient);
      router.push("/gym");
    },
  });

  const handleDeleteRun = () => {
    setShowDeleteConfirm(true);
  };

  return (
    <div className="space-y-4">
      {autosave.isResuming && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <span className="text-zinc-300">
            Resuming workout · {formatFiDate(workoutDate)}
          </span>
          <SaveStatusText
            status={autosave.saveStatus}
            hasPendingSave={autosave.hasPendingSave}
          />
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-zinc-400">
            Run type
          </label>
          {!autosave.isResuming && (
            <SaveStatusText
              status={autosave.saveStatus}
              hasPendingSave={autosave.hasPendingSave}
            />
          )}
        </div>
        <select
          value={selectedMovementId}
          onChange={(e) => setMovementId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-base"
        >
          {runMovements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="text-sm text-zinc-500">
            {previousLoading ? (
              <p>Loading previous...</p>
            ) : previous ? (
              <>
                <p>
                  Last time ({formatFiDate(previous.sessionDate)}):{" "}
                  {formatPreviousSets(previous.sets, "Cardio")}
                </p>
                {previous.note && (
                  <p className="italic">&ldquo;{previous.note}&rdquo;</p>
                )}
              </>
            ) : (
              <p>No previous run logged</p>
            )}
          </div>
          <button
            type="button"
            onClick={copyLastSession}
            disabled={!previous?.sets.length}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs font-medium text-brand disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Last
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-400">
              Duration (min)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="30"
              value={duration}
              onChange={(e) => setDuration(sanitizeDecimalInput(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center text-base"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-400">
              Distance (km)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="3,5"
              value={distance}
              onChange={(e) => setDistance(sanitizeDecimalInput(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center text-base"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-400">
              Speed (kph)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="5,3"
              value={speed}
              onChange={(e) => setSpeed(sanitizeDecimalInput(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center text-base"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-400">
              Elevation (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="3,8"
              value={elevation}
              onChange={(e) => setElevation(sanitizeDecimalInput(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center text-base"
            />
          </div>
        </div>

        <input
          type="text"
          placeholder="Notes (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
        />

        {duration && distance && (
          <p className="mt-3 text-sm text-zinc-500">
            Summary:{" "}
            {formatCardioSetLine(
              parseLocaleNumber(distance) || 0,
              parseLocaleNumber(duration) || 0
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => finishMutation.mutate()}
        disabled={
          finishMutation.isPending || !autosave.canFinish || !autosave.ready
        }
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-lg font-semibold text-white shadow-lg shadow-brand/30 disabled:opacity-60"
      >
        <Check className="h-5 w-5" />
        {finishMutation.isPending ? "Finishing..." : "Finish Run"}
      </button>

      {finishMutation.isError && (
        <p className="text-center text-sm text-red-500">
          Failed to finish. Check your connection.
        </p>
      )}

      {autosave.sessionId && (
        <button
          type="button"
          onClick={handleDeleteRun}
          disabled={deleteMutation.isPending || !autosave.ready}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-900/50 py-3 text-sm font-medium text-red-400 hover:bg-red-950/30 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
          {deleteMutation.isPending ? "Deleting..." : "Delete workout"}
        </button>
      )}

      {deleteMutation.isError && (
        <p className="text-center text-sm text-red-500">
          Failed to delete. Check your connection.
        </p>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete workout?"
        message={`Delete this workout for ${formatFiDate(workoutDate)}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
