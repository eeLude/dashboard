"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { HubMonthActivity } from "@/components/HubMonthActivity";
import { HubCard } from "@/components/hub/HubCard";
import {
  LoadingSpinner,
  QueryErrorBanner,
} from "@/components/LoadingStates";
import { HubWeightChart } from "@/components/charts/HubWeightChart";
import { HubRunChart } from "@/components/charts/HubRunChart";
import {
  getHealthLogs,
  getRunProgress,
  getWorkoutDaysInRange,
  HEALTH_LOG_DAYS,
} from "@/lib/queries";
import { toDateString } from "@/lib/utils";

export function HubGymCard() {
  const { t } = useLocale();
  const now = new Date();
  const today = toDateString(now);
  const yearStart = `${now.getFullYear()}-01-01`;

  const workoutsQuery = useQuery({
    queryKey: ["workout-days-range", yearStart, today],
    queryFn: () => getWorkoutDaysInRange(yearStart, today),
  });

  const healthQuery = useQuery({
    queryKey: ["health-logs", HEALTH_LOG_DAYS],
    queryFn: () => getHealthLogs(HEALTH_LOG_DAYS),
  });

  const runQuery = useQuery({
    queryKey: ["run-progress"],
    queryFn: getRunProgress,
  });

  const yearDays = workoutsQuery.data ?? [];
  const sessionsThisYear = yearDays.filter((d) => d.isComplete).length;
  const isLoading = workoutsQuery.isLoading || healthQuery.isLoading;
  const isError = workoutsQuery.isError || healthQuery.isError;
  const hasWeight = (healthQuery.data ?? []).some((l) => l.weight_kg != null);
  const runs = runQuery.data ?? [];

  return (
    <HubCard
      title={t("card.gym")}
      footer={
        <div className="flex gap-2">
          <Link
            href="/gym"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500"
          >
            {t("hub.gym.gymStats")}
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/workout"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
          >
            {t("hub.gym.logWorkout")}
          </Link>
        </div>
      }
    >
      {isError && (
        <QueryErrorBanner
          message={t("hub.gym.error")}
          onRetry={() => {
            void workoutsQuery.refetch();
            void healthQuery.refetch();
            void runQuery.refetch();
          }}
        />
      )}
      {isLoading && (
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
          <LoadingSpinner className="h-4 w-4" />
          {t("common.loading")}
        </div>
      )}
      {!isLoading && (
        <>
          <p className="text-3xl font-semibold tracking-tight text-zinc-100">
            {sessionsThisYear}
          </p>
          <p className="text-sm text-zinc-500">
            {sessionsThisYear === 1
              ? t("hub.gym.sessionThisYear")
              : t("hub.gym.sessionsThisYear")}
          </p>
        </>
      )}
      {hasWeight && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("hub.gym.weight")}
          </h3>
          <HubWeightChart logs={healthQuery.data ?? []} />
        </div>
      )}
      {runs.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("hub.gym.run")}
          </h3>
          <HubRunChart runs={runs} />
        </div>
      )}
      {!workoutsQuery.isLoading && (
        <div className="mt-5">
          <HubMonthActivity days={yearDays} />
        </div>
      )}
    </HubCard>
  );
}
