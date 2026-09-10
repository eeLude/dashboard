"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingSpinner } from "@/components/LoadingStates";
import { MobileLayout } from "@/components/MobileLayout";
import { RunWorkoutForm } from "@/components/RunWorkoutForm";
import {
  cardFromMovement,
  cardFromTemplate,
  ExerciseCard,
} from "@/components/workout/ExerciseCard";
import { MovementPicker } from "@/components/workout/MovementPicker";
import { SaveStatusText } from "@/components/workout/SaveStatusText";
import { useActiveWorkout } from "@/lib/useActiveWorkout";
import {
  getAllMovements,
  getSplitById,
  getSplitTemplate,
  getWorkoutSessionForDate,
  invalidateWorkoutDashboardQueries,
} from "@/lib/queries";
import { formatFiDate, isFutureDate, toDateString } from "@/lib/dates";
import type { Movement } from "@/types/database";

export default function ActiveWorkoutPage({
  params,
}: {
  params: Promise<{ splitId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <MobileLayout hideNav>
          <div className="flex justify-center py-12">
            <LoadingSpinner className="h-6 w-6" />
          </div>
        </MobileLayout>
      }
    >
      <ActiveWorkoutContent params={params} />
    </Suspense>
  );
}

function ActiveWorkoutContent({
  params,
}: {
  params: Promise<{ splitId: string }>;
}) {
  const { splitId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const dateParam = searchParams.get("date");
  const workoutDate =
    dateParam && !isFutureDate(dateParam) ? dateParam : toDateString(new Date());

  const splitQuery = useQuery({
    queryKey: ["split", splitId],
    queryFn: () => getSplitById(splitId),
  });

  const templateQuery = useQuery({
    queryKey: ["split-template", splitId],
    queryFn: () => getSplitTemplate(splitId),
  });

  const movementsQuery = useQuery({
    queryKey: ["movements"],
    queryFn: getAllMovements,
  });

  const sessionForDateQuery = useQuery({
    queryKey: ["workout-session-for-date", workoutDate],
    queryFn: () => getWorkoutSessionForDate(workoutDate),
  });

  useEffect(() => {
    if (!sessionForDateQuery.data) return;
    if (sessionForDateQuery.data.split_id !== splitId) {
      router.replace(
        `/workout/${sessionForDateQuery.data.split_id}?date=${workoutDate}`
      );
    }
  }, [sessionForDateQuery.data, splitId, workoutDate, router]);

  const loggerReady =
    sessionForDateQuery.isSuccess &&
    (!sessionForDateQuery.data ||
      sessionForDateQuery.data.split_id === splitId);

  const buildInitialCards = useCallback(() => {
    return (
      templateQuery.data
        ?.filter((slot) => slot.movements)
        .map((slot) => cardFromTemplate(slot)) ?? []
    );
  }, [templateQuery.data]);

  const workout = useActiveWorkout({
    splitId,
    workoutDate,
    buildInitialCards,
    templateReady: !!templateQuery.data && loggerReady,
  });

  const [showPicker, setShowPicker] = useState(false);
  const [startingFresh, setStartingFresh] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const finishMutation = useMutation({
    mutationFn: () => workout.finishWorkout(),
    onSuccess: async () => {
      await invalidateWorkoutDashboardQueries(queryClient);
      router.push("/gym");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => workout.deleteWorkout(),
    onSuccess: async () => {
      await invalidateWorkoutDashboardQueries(queryClient);
      router.push("/gym");
    },
  });

  const handleStartFresh = async () => {
    setStartingFresh(true);
    try {
      await workout.startFresh();
    } finally {
      setStartingFresh(false);
    }
  };

  const handleAddCard = (movement: Movement) => {
    workout.addCard(cardFromMovement(movement));
    setShowPicker(false);
  };

  const muscleGroups = useMemo(
    () =>
      [...new Set((movementsQuery.data ?? []).map((m) => m.target_muscle))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [movementsQuery.data]
  );

  const isRunSplit = splitQuery.data?.name === "Run";

  if (sessionForDateQuery.isLoading || !loggerReady) {
    return (
      <MobileLayout hideNav>
        <div className="flex justify-center py-12">
          <LoadingSpinner className="h-6 w-6" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout hideNav>
      <header className="mb-4 flex items-center gap-3">
        <Link
          href={`/workout?date=${workoutDate}&pick=1`}
          className="rounded-full p-2 hover:bg-zinc-800"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-zinc-100">
            {splitQuery.data?.name ?? "Workout"}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-zinc-400">
              {formatFiDate(workoutDate)}
              {isRunSplit ? " · Run" : " · Log sets"}
            </p>
            {!isRunSplit && workout.cardsReady && (
              <SaveStatusText
                status={workout.saveStatus}
                hasPendingSave={workout.hasPendingSave}
              />
            )}
          </div>
        </div>
      </header>

      {workout.isResuming && !isRunSplit && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <span className="text-zinc-300">
            Resuming workout · {formatFiDate(workoutDate)}
          </span>
          <button
            type="button"
            onClick={() => void handleStartFresh()}
            disabled={startingFresh}
            className="shrink-0 text-brand hover:underline disabled:opacity-50"
          >
            Start fresh
          </button>
        </div>
      )}

      {templateQuery.isError && (
        <p className="text-sm text-red-400">
          Could not load workout template. Check your connection and try again.
        </p>
      )}

      {isRunSplit ? (
        <RunWorkoutForm splitId={splitId} workoutDate={workoutDate} />
      ) : (
        <>
          <div className="space-y-4">
            {workout.cards.map((draft) => (
              <ExerciseCard
                key={draft.cardId}
                draft={draft}
                onChange={(updated) => workout.updateCard(draft.cardId, updated)}
                onRemove={() => void workout.removeCard(draft.cardId)}
                canMoveUp={workout.canMoveUp(draft.cardId)}
                canMoveDown={workout.canMoveDown(draft.cardId)}
                onMoveUp={() => void workout.moveCard(draft.cardId, "up")}
                onMoveDown={() => void workout.moveCard(draft.cardId, "down")}
                sessionId={workout.sessionId}
                workoutDate={workoutDate}
              />
            ))}

            {workout.cards.length === 0 && workout.cardsReady && (
              <p className="text-center text-sm text-zinc-500">
                No exercises yet. Add one below.
              </p>
            )}
          </div>

          {showPicker ? (
            <div className="mt-4">
              <MovementPicker
                movements={movementsQuery.data ?? []}
                muscleGroups={muscleGroups}
                onSelect={handleAddCard}
                onClose={() => setShowPicker(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-medium text-zinc-300 hover:border-brand hover:text-brand"
            >
              <Plus className="h-4 w-4" />
              Add exercise
            </button>
          )}

          <button
            type="button"
            onClick={() => finishMutation.mutate()}
            disabled={
              finishMutation.isPending ||
              !workout.hasSavedSets ||
              !workout.cardsReady
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-lg font-semibold text-white shadow-lg shadow-brand/30 disabled:opacity-60"
          >
            <Check className="h-5 w-5" />
            {finishMutation.isPending ? "Finishing..." : "Finish Workout"}
          </button>

          {finishMutation.isError && (
            <p className="mt-2 text-center text-sm text-red-500">
              {finishMutation.error instanceof Error
                ? finishMutation.error.message
                : "Failed to finish. Check your connection."}
            </p>
          )}

          {workout.sessionId && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending || !workout.cardsReady}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-900/50 py-3 text-sm font-medium text-red-400 hover:bg-red-950/30 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Delete workout
            </button>
          )}

          {deleteMutation.isError && (
            <p className="mt-2 text-center text-sm text-red-500">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "Failed to delete. Check your connection."}
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
        </>
      )}
    </MobileLayout>
  );
}
