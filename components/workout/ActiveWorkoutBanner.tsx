"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Play } from "lucide-react";
import { getActiveWorkoutSession } from "@/lib/queries";
import { formatFiDate } from "@/lib/dates";

export function ActiveWorkoutBanner() {
  const { data: session } = useQuery({
    queryKey: ["active-workout-session"],
    queryFn: getActiveWorkoutSession,
  });

  if (!session) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-4 shadow-lg shadow-brand/10">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-brand">
            Active Workout
          </span>
        </div>
        <p className="mt-1 truncate text-base font-bold text-zinc-100">
          {session.splitName}
        </p>
        <p className="text-xs text-zinc-400">
          Started {formatFiDate(session.date)}
        </p>
      </div>
      <Link
        href={`/workout/${session.split_id}?date=${session.date}`}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand/30 active:scale-95"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Resume
      </Link>
    </div>
  );
}
