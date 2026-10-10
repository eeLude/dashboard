"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { HubCard } from "@/components/hub/HubCard";
import {
  LoadingSpinner,
  QueryErrorBanner,
} from "@/components/LoadingStates";
import {
  getHomelabSnapshot,
  glanceServices,
  type HomelabServiceStatus,
} from "@/lib/homelab";
import { formatLocaleNumber } from "@/lib/utils";

function statusDotClass(status: HomelabServiceStatus): string {
  if (status === "up") return "bg-emerald-500";
  if (status === "down") return "bg-red-500";
  return "bg-zinc-600";
}

function cpuTempColorClass(temp: number | null | undefined): string {
  if (temp == null) return "text-zinc-500";
  if (temp < 60) return "text-emerald-400";
  if (temp < 75) return "text-amber-400";
  return "text-red-400";
}

export function HubHomelabCard() {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["homelab-snapshot"],
    queryFn: getHomelabSnapshot,
    refetchInterval: 30_000, // 30 s auto-refresh in view
  });

  const snapshot = query.data ?? null;
  const online = snapshot?.online === true;
  const services = glanceServices(snapshot);

  return (
    <HubCard
      title={t("card.homelab")}
      action={
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="rounded p-1 text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
          title={t("homelab.refresh")}
          aria-label={t("homelab.refresh")}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin text-emerald-400" : ""}`}
          />
        </button>
      }
      footer={
        <Link
          href="/homelab"
          className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500"
        >
          {t("hub.homelab.open")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      }
    >
      {query.isError && (
        <QueryErrorBanner
          message={t("hub.homelab.error")}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
          <LoadingSpinner className="h-4 w-4" />
          {t("common.loading")}
        </div>
      )}
      {!query.isLoading && !query.isError && (
        <>
          {online ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <p className="text-2xl font-bold tracking-tight text-emerald-400">
                    {t("hub.homelab.online")}
                  </p>
                </div>
                {snapshot?.uptime && (
                  <span className="rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                    {snapshot.uptime}
                  </span>
                )}
              </div>

              {/* Stats pills */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    CPU
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-200">
                    {formatLocaleNumber(snapshot?.cpuPct ?? 0, 0)}%
                  </p>
                  <p className={`text-[10px] font-medium ${cpuTempColorClass(snapshot?.cpuTemp)}`}>
                    {snapshot?.cpuTemp != null ? `${snapshot.cpuTemp} °C` : "—"}
                  </p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    RAM
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-200">
                    {snapshot?.memUsedGb != null ? `${snapshot.memUsedGb} Gt` : `${formatLocaleNumber(snapshot?.memPct ?? 0, 0)}%`}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {formatLocaleNumber(snapshot?.memPct ?? 0, 0)}%
                  </p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Levy
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-200">
                    {snapshot?.diskUsedGb != null ? `${snapshot.diskUsedGb} Gt` : `${formatLocaleNumber(snapshot?.diskPct ?? 0, 0)}%`}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {formatLocaleNumber(snapshot?.diskPct ?? 0, 0)}%
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-zinc-300">
                {t("hub.homelab.offline")}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {t("hub.homelab.notOnline")}
              </p>
            </>
          )}

          {/* Quick service pills */}
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {services.map((service) => {
              const chip = (
                <div
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                  title={`${service.name} (${service.role}) · ${service.status}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${statusDotClass(service.status)}`}
                  />
                  <span className="font-medium">{service.name}</span>
                </div>
              );

              if (service.href) {
                return (
                  <a
                    key={service.id}
                    href={service.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    {chip}
                  </a>
                );
              }

              return <div key={service.id}>{chip}</div>;
            })}
          </div>
        </>
      )}
    </HubCard>
  );
}
