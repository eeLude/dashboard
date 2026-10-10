"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useLocale } from "@/components/LocaleProvider";
import { MobileLayout } from "@/components/MobileLayout";
import {
  LoadingSpinner,
  QueryErrorBanner,
} from "@/components/LoadingStates";
import {
  HOMELAB_HOST,
  PLANNED_ROUTER,
  allServices,
  getHomelabSnapshot,
  type HomelabServiceStatus,
} from "@/lib/homelab";
import { formatLocaleNumber } from "@/lib/utils";

function statusLabel(
  status: HomelabServiceStatus,
  t: (key: import("@/lib/i18n/messages").MessageKey) => string
): string {
  if (status === "up") return t("homelab.status.up");
  if (status === "down") return t("homelab.status.down");
  return t("homelab.status.planned");
}

function statusClass(status: HomelabServiceStatus): string {
  if (status === "up") return "text-emerald-400";
  if (status === "down") return "text-red-400";
  return "text-zinc-500";
}

function statusDotClass(status: HomelabServiceStatus): string {
  if (status === "up") return "bg-emerald-500";
  if (status === "down") return "bg-red-500";
  return "bg-zinc-600";
}

function cpuTempBadge(temp: number | null | undefined) {
  if (temp == null) return null;
  const color =
    temp < 60
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/30"
      : temp < 75
        ? "text-amber-400 border-amber-500/30 bg-amber-950/30"
        : "text-red-400 border-red-500/30 bg-red-950/30";

  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${color}`}
      title="CPU Package Temperature"
    >
      {temp} °C
    </span>
  );
}

function ResourceBar({
  label,
  pct,
  detail,
  extraBadge,
}: {
  label: string;
  pct: number | null;
  detail?: string | null;
  extraBadge?: React.ReactNode;
}) {
  const ready = pct != null && Number.isFinite(pct);
  const width = ready ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          {extraBadge}
        </div>
        <p className="text-sm font-medium text-zinc-300">
          {detail ?? (ready ? `${formatLocaleNumber(pct, 0)}%` : "—")}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            ready
              ? pct > 90
                ? "bg-red-500"
                : pct > 75
                  ? "bg-amber-400"
                  : "bg-zinc-300"
              : "bg-zinc-800"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function HomelabPage() {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["homelab-snapshot"],
    queryFn: getHomelabSnapshot,
    refetchInterval: 15_000, // 15s auto-refresh on this page
  });

  const snapshot = query.data ?? null;
  const services = allServices(snapshot);
  const router = snapshot?.router ?? PLANNED_ROUTER;
  const online = snapshot?.online === true;

  return (
    <MobileLayout>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            {t("homelab.title")}
          </h1>
          <p className="text-sm text-zinc-400">{HOMELAB_HOST.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
            title={t("homelab.refresh")}
            aria-label={t("homelab.refresh")}
          >
            <RefreshCw
              className={`h-4 w-4 ${query.isFetching ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
          <LocaleToggle />
        </div>
      </header>

      {query.isError && (
        <QueryErrorBanner
          message={t("homelab.error")}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
          <LoadingSpinner className="h-4 w-4" />
          {t("common.loading")}
        </div>
      )}

      {/* Host hardware & metrics */}
      <section className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {t("homelab.host")}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  online ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
                }`}
              />
              <p className="text-lg font-semibold text-zinc-100">
                {online ? t("homelab.online") : t("homelab.offline")}
              </p>
            </div>
          </div>
          {snapshot?.uptime && (
            <div className="text-right">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("homelab.uptime")}
              </span>
              <p className="text-xs font-semibold text-zinc-300">
                {snapshot.uptime}
              </p>
            </div>
          )}
        </div>

        <p className="mt-1 text-xs text-zinc-500">
          {HOMELAB_HOST.cpu} · {HOMELAB_HOST.ramGb} GB RAM · {HOMELAB_HOST.diskGb} GB SSD
        </p>

        {!online && (
          <p className="mt-2 text-sm text-zinc-600">{t("homelab.notOnline")}</p>
        )}

        <div className="mt-5 space-y-4">
          <ResourceBar
            label={t("homelab.cpu")}
            pct={snapshot?.cpuPct ?? null}
            detail={
              snapshot?.cpuPct != null
                ? `${formatLocaleNumber(snapshot.cpuPct, 0)}%`
                : null
            }
            extraBadge={cpuTempBadge(snapshot?.cpuTemp)}
          />

          <ResourceBar
            label={t("homelab.memory")}
            pct={snapshot?.memPct ?? null}
            detail={
              snapshot?.memUsedGb != null
                ? `${snapshot.memUsedGb} / ${snapshot.memTotalGb ?? HOMELAB_HOST.ramGb} Gt (${formatLocaleNumber(snapshot.memPct ?? 0, 0)}%)`
                : snapshot?.memPct != null
                  ? `${formatLocaleNumber(snapshot.memPct, 0)}%`
                  : null
            }
          />

          <ResourceBar
            label={t("homelab.disk")}
            pct={snapshot?.diskPct ?? null}
            detail={
              snapshot?.diskUsedGb != null
                ? `${snapshot.diskUsedGb} / ${snapshot.diskTotalGb ?? HOMELAB_HOST.diskGb} Gt (${formatLocaleNumber(snapshot.diskPct ?? 0, 0)}%)`
                : snapshot?.diskPct != null
                  ? `${formatLocaleNumber(snapshot.diskPct, 0)}%`
                  : null
            }
          />
        </div>
      </section>

      {/* Services list */}
      <section className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {t("homelab.services")}
          </h2>
          <span className="text-xs text-zinc-500">
            {services.filter((s) => s.status === "up").length} / {services.length} {t("homelab.status.up")}
          </span>
        </div>

        <ul className="mt-3 divide-y divide-zinc-800/80">
          {services.map((service) => (
            <li
              key={service.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(service.status)}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {service.name}
                    </p>
                    {service.href && (
                      <a
                        href={service.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        title={`${t("homelab.open")} ${service.name}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{service.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <p className={`text-xs font-medium ${statusClass(service.status)}`}>
                  {statusLabel(service.status, t)}
                </p>
                {service.href && (
                  <a
                    href={service.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                  >
                    {t("homelab.open")}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Network / Router */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {t("homelab.network")}
        </h2>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">{router.name}</p>
            <p className="text-xs text-zinc-500">
              {t("homelab.via")} {router.via}
            </p>
          </div>
          <p
            className={`shrink-0 text-xs font-medium ${statusClass(router.status)}`}
          >
            {statusLabel(router.status, t)}
          </p>
        </div>
      </section>
    </MobileLayout>
  );
}
