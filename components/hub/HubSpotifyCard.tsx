"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLocale } from "@/components/LocaleProvider";
import { HubCard } from "@/components/hub/HubCard";
import {
  LoadingSpinner,
  QueryErrorBanner,
} from "@/components/LoadingStates";
import {
  formatListeningMinutes,
  SPOTIFY_TIME_RANGES,
  type SpotifyStats,
  type SpotifyTimeRange,
} from "@/lib/spotify";

const STALE_MS = 5 * 60 * 1000; // 5 minutes

async function fetchMusicStats(
  accessToken: string,
  timeRange: SpotifyTimeRange
): Promise<SpotifyStats> {
  const res = await fetch(`/api/spotify/stats?time_range=${timeRange}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 503) {
    throw Object.assign(new Error("not-configured"), { code: "not-configured" });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not load music stats.");
  }
  return (await res.json()) as SpotifyStats;
}

export function HubSpotifyCard() {
  const { t, locale } = useLocale();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [timeRange, setTimeRange] = useState<SpotifyTimeRange>("7day");

  const statsQuery = useQuery({
    queryKey: ["music-stats", timeRange],
    queryFn: () => fetchMusicStats(accessToken!, timeRange),
    enabled: Boolean(accessToken),
    staleTime: STALE_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const stats = statsQuery.data;
  const notConfigured =
    statsQuery.error != null &&
    (statsQuery.error as { code?: string }).code === "not-configured";

  const otherGenres = (stats?.genres ?? []).filter(
    (genre) => genre.toLowerCase() !== stats?.topGenre?.toLowerCase()
  );

  return (
    <HubCard
      title={t("card.spotify")}
      footer={
        stats?.allTimeScrobbles ? (
          <p className="w-full text-center text-[11px] text-zinc-500">
            {stats.allTimeScrobbles.toLocaleString()}{" "}
            {t("hub.spotify.allTime")}
          </p>
        ) : null
      }
    >
      {notConfigured && (
        <p className="text-sm text-zinc-500">{t("hub.spotify.notConfigured")}</p>
      )}

      {statsQuery.isLoading && !stats && !notConfigured && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <LoadingSpinner className="h-4 w-4" />
          {t("common.loading")}
        </div>
      )}

      {statsQuery.isError && !notConfigured && (
        <QueryErrorBanner
          message={
            statsQuery.error instanceof Error
              ? statsQuery.error.message
              : t("hub.spotify.error")
          }
          onRetry={() => void statsQuery.refetch()}
        />
      )}

      {stats && (
        <div>
          {/* Header with Top Genre and Listening Time */}
          <div className="flex items-start justify-between gap-2">
            <div>
              {stats.topGenre ? (
                <>
                  <p className="text-2xl font-semibold capitalize tracking-tight text-zinc-100">
                    {stats.topGenre}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t("hub.spotify.topGenre")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-400">
                  {t("hub.spotify.listeningStats")}
                </p>
              )}
            </div>

            {stats.totalPlays > 0 && (
              <div className="rounded-lg bg-zinc-800/80 px-2.5 py-1 text-right">
                <p className="text-xs font-semibold text-zinc-200">
                  {formatListeningMinutes(stats.totalMinutes, locale)}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {stats.totalPlays} {t("hub.spotify.plays")}
                </p>
              </div>
            )}
          </div>

          {/* Time Range Selector */}
          <div className="mt-3 flex rounded-lg bg-zinc-800 p-0.5">
            {SPOTIFY_TIME_RANGES.map((range) => {
              const active = range.id === timeRange;
              return (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setTimeRange(range.id)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-zinc-700 text-zinc-100 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {locale === "fi" ? range.labelFi : range.labelEn}
                </button>
              );
            })}
          </div>

          {statsQuery.isFetching && (
            <p className="mt-1.5 text-[10px] text-zinc-600">Updating…</p>
          )}

          {/* Top Albums Row */}
          {stats.albums.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {t("hub.spotify.topAlbums")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {stats.albums.map((album) => (
                  <div
                    key={album.id}
                    className="group relative flex flex-col items-center text-center"
                    title={`${album.name} – ${album.artist} (${album.plays} ${t("hub.spotify.plays")})`}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-800 shadow-inner">
                      {album.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={album.imageUrl}
                          alt={album.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                          ♪
                        </div>
                      )}
                    </div>
                    <p className="mt-1 w-full truncate text-[11px] font-medium text-zinc-300">
                      {album.name}
                    </p>
                    <p className="w-full truncate text-[10px] text-zinc-500">
                      {album.plays}x
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Tracks List */}
          {stats.tracks.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {t("hub.spotify.topTracks")}
              </p>
              <ol className="space-y-1.5">
                {stats.tracks.map((track, i) => (
                  <li
                    key={track.id}
                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-zinc-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-3 shrink-0 text-xs text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="truncate text-zinc-200">
                        {track.name}
                        <span className="text-zinc-500"> · {track.artist}</span>
                      </span>
                    </div>
                    {track.plays > 0 && (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {track.plays}x
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Top Artists Pills */}
          {stats.artists.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {t("hub.spotify.topArtists")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.artists.map((artist, i) => (
                  <span
                    key={artist.id}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-200"
                  >
                    <span className="text-zinc-500 text-[10px]">{i + 1}.</span>
                    <span>{artist.name}</span>
                    {artist.plays > 0 && (
                      <span className="text-[10px] text-zinc-400">
                        ({artist.plays})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Other Genres */}
          {otherGenres.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-800/60 pt-3">
              {otherGenres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-[10px] capitalize text-zinc-400"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {stats.artists.length === 0 && stats.tracks.length === 0 && (
            <p className="mt-3 text-sm text-zinc-500">
              {t("hub.spotify.empty")}
            </p>
          )}
        </div>
      )}
    </HubCard>
  );
}
