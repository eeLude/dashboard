"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingStates";
import { MobileLayout } from "@/components/MobileLayout";
import { formatFiDate, isFutureDate, toDateString } from "@/lib/dates";
import { getSplits, getWorkoutSessionForDate } from "@/lib/queries";

function WorkoutPickerContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const date =
    dateParam && !isFutureDate(dateParam) ? dateParam : toDateString(new Date());
  const pickSplit = searchParams.get("pick") === "1";

  const sessionQuery = useQuery({
    queryKey: ["workout-session-for-date", date],
    queryFn: () => getWorkoutSessionForDate(date),
  });

  const splitsQuery = useQuery({
    queryKey: ["splits"],
    queryFn: getSplits,
  });

  const isCompleted = !!sessionQuery.data?.completed_at;

  if (sessionQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner className="h-6 w-6" />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <p className="text-center text-sm text-red-400">
        Could not load workout for this date. Check your connection and try again.
      </p>
    );
  }

  return (
    <>
      {splitsQuery.isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner className="h-6 w-6" />
        </div>
      )}

      {splitsQuery.isError && (
        <p className="text-center text-sm text-red-400">
          Could not load splits. Sign in and check your connection.
        </p>
      )}

      {sessionQuery.data && !isCompleted && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-brand/40 bg-brand/10 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              In-progress workout
            </p>
            <p className="text-base font-semibold text-zinc-100">
              {sessionQuery.data.splitName}
            </p>
          </div>
          <Link
            href={`/workout/${sessionQuery.data.split_id}?date=${date}`}
            className="rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-brand/30"
          >
            Resume
          </Link>
        </div>
      )}

      {sessionQuery.data && isCompleted && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Completed today
            </p>
            <p className="text-base font-semibold text-zinc-200">
              {sessionQuery.data.splitName}
            </p>
          </div>
          <Link
            href={`/workout/${sessionQuery.data.split_id}?date=${date}`}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500"
          >
            View workout
          </Link>
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {sessionQuery.data ? "Or start another split" : "Select split"}
      </p>

      <div className="space-y-3">
        {splitsQuery.data?.map((split) => (
          <Link
            key={split.id}
            href={`/workout/${split.id}?date=${date}`}
            className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 transition active:scale-[0.99]"
          >
            <span className="text-lg font-semibold text-zinc-100">
              {split.name}
            </span>
            <ChevronRight className="h-5 w-5 text-brand" />
          </Link>
        ))}
      </div>
    </>
  );
}

function WorkoutPickerPage() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const date =
    dateParam && !isFutureDate(dateParam) ? dateParam : toDateString(new Date());

  return (
    <MobileLayout>
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/gym"
          className="rounded-full p-2 hover:bg-zinc-800"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Log Workout</h1>
          <p className="text-sm text-zinc-400">
            Choose split for {formatFiDate(date)}
          </p>
        </div>
      </header>

      <WorkoutPickerContent />
    </MobileLayout>
  );
}

export default function WorkoutSelectorPage() {
  return (
    <Suspense
      fallback={
        <MobileLayout>
          <div className="flex justify-center py-8">
            <LoadingSpinner className="h-6 w-6" />
          </div>
        </MobileLayout>
      }
    >
      <WorkoutPickerPage />
    </Suspense>
  );
}
