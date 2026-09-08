import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { lookupArtistGenres } from "@/lib/artist-genre";
import {
  parseSpotifyTimeRange,
  type MusicAlbum,
  type MusicArtist,
  type MusicTrack,
  type SpotifyStats,
} from "@/lib/spotify";
import type { Database } from "@/types/database";

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const DEFAULT_TRACK_DURATION_SEC = 210; // 3.5 minutes fallback if duration not given

function supabaseForUser(accessToken: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

type LastFmImage = { "#text"?: string; size?: string };

type LastFmArtistItem = {
  name: string;
  playcount?: string;
  mbid?: string;
  url?: string;
  image?: LastFmImage[];
};

type LastFmTrackItem = {
  name: string;
  playcount?: string;
  duration?: string;
  mbid?: string;
  artist?: { name?: string; mbid?: string; url?: string };
};

type LastFmAlbumItem = {
  name: string;
  playcount?: string;
  mbid?: string;
  artist?: { name?: string; mbid?: string };
  image?: LastFmImage[];
};

export async function GET(request: NextRequest) {
  const rawApiKey = process.env.LASTFM_API_KEY;
  const rawUsername = process.env.LASTFM_USERNAME;

  const apiKey = rawApiKey?.replace(/^["']|["']$/g, "").trim();
  const username = rawUsername?.replace(/^["']|["']$/g, "").trim();

  if (!apiKey || !username) {
    return NextResponse.json(
      { error: "Last.fm is not configured in .env.local." },
      { status: 503 }
    );
  }

  const jwt = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const supabase = supabaseForUser(jwt);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const timeRange = parseSpotifyTimeRange(
    request.nextUrl.searchParams.get("time_range")
  );

  const fetchHeaders = {
    "User-Agent": "LiftmaxxingDashboard/1.0 (https://github.com/eeLude/dashboard)",
    Accept: "application/json",
  };

  const artistUrl = `${LASTFM_BASE}?method=user.gettopartists&user=${encodeURIComponent(
    username
  )}&api_key=${apiKey}&period=${timeRange}&limit=10&format=json`;

  const trackUrl = `${LASTFM_BASE}?method=user.gettoptracks&user=${encodeURIComponent(
    username
  )}&api_key=${apiKey}&period=${timeRange}&limit=50&format=json`;

  const albumUrl = `${LASTFM_BASE}?method=user.gettopalbums&user=${encodeURIComponent(
    username
  )}&api_key=${apiKey}&period=${timeRange}&limit=6&format=json`;

  const infoUrl = `${LASTFM_BASE}?method=user.getinfo&user=${encodeURIComponent(
    username
  )}&api_key=${apiKey}&format=json`;

  const [artistsRes, tracksRes, albumsRes, infoRes] = await Promise.all([
    fetch(artistUrl, { headers: fetchHeaders, cache: "no-store" }),
    fetch(trackUrl, { headers: fetchHeaders, cache: "no-store" }),
    fetch(albumUrl, { headers: fetchHeaders, cache: "no-store" }),
    fetch(infoUrl, { headers: fetchHeaders, cache: "no-store" }),
  ]);

  if (!artistsRes.ok || !tracksRes.ok) {
    const artistsErr = !artistsRes.ok
      ? ((await artistsRes.json().catch(() => null)) as { message?: string } | null)
      : null;
    const tracksErr = !tracksRes.ok
      ? ((await tracksRes.json().catch(() => null)) as { message?: string } | null)
      : null;
    const msg =
      artistsErr?.message ||
      tracksErr?.message ||
      `HTTP status artists=${artistsRes.status}, tracks=${tracksRes.status}`;
    console.error("Last.fm request failed:", {
      username,
      artistsStatus: artistsRes.status,
      tracksStatus: tracksRes.status,
      artistsErr,
      tracksErr,
    });
    return NextResponse.json(
      { error: `Last.fm: ${msg}` },
      { status: 502 }
    );
  }

  const [artistsJson, tracksJson, albumsJson, infoJson] = await Promise.all([
    artistsRes.json().catch(() => ({})) as Promise<{
      topartists?: { artist?: LastFmArtistItem[] };
    }>,
    tracksRes.json().catch(() => ({})) as Promise<{
      toptracks?: { track?: LastFmTrackItem[] };
    }>,
    (albumsRes.ok
      ? albumsRes.json().catch(() => ({}))
      : Promise.resolve({})) as Promise<{
      topalbums?: { album?: LastFmAlbumItem[] };
    }>,
    (infoRes.ok
      ? infoRes.json().catch(() => ({}))
      : Promise.resolve({})) as Promise<{
      user?: { playcount?: string };
    }>,
  ]);

  const rawArtists: LastFmArtistItem[] =
    artistsJson?.topartists?.artist ?? [];
  const rawTracks: LastFmTrackItem[] =
    tracksJson?.toptracks?.track ?? [];
  const rawAlbums: LastFmAlbumItem[] =
    albumsJson?.topalbums?.album ?? [];

  // Duration & Scrobbles calculation
  let knownDurSum = 0;
  let knownDurCount = 0;
  for (const t of rawTracks) {
    const dur = parseInt(t.duration || "0", 10);
    if (dur >= 30 && dur <= 1800) {
      knownDurSum += dur;
      knownDurCount++;
    }
  }
  const avgDuration =
    knownDurCount > 0
      ? Math.round(knownDurSum / knownDurCount)
      : DEFAULT_TRACK_DURATION_SEC;

  let totalSeconds = 0;
  let totalPlays = 0;
  for (const t of rawTracks) {
    const count = parseInt(t.playcount || "1", 10);
    totalPlays += count;
    const dur = parseInt(t.duration || "0", 10);
    totalSeconds += (dur > 0 ? dur : avgDuration) * count;
  }
  const totalMinutes = Math.round(totalSeconds / 60);

  // Top Artists
  const artists: MusicArtist[] = rawArtists.slice(0, 5).map((a, i) => ({
    id: a.mbid || `${a.name}-${i}`,
    name: a.name,
    plays: parseInt(a.playcount || "0", 10),
  }));

  // Top Tracks
  const tracks: MusicTrack[] = rawTracks.slice(0, 5).map((t, i) => ({
    id: t.mbid || `${t.name}-${t.artist?.name ?? i}`,
    name: t.name,
    artist: t.artist?.name || "Unknown Artist",
    plays: parseInt(t.playcount || "0", 10),
  }));

  // Top Albums
  const albums: MusicAlbum[] = rawAlbums.slice(0, 4).map((al, i) => {
    const imgObj =
      al.image?.find((img) => img.size === "extralarge" || img.size === "large") ||
      al.image?.find((img) => img.size === "medium");
    const rawUrl = imgObj?.["#text"]?.trim();
    return {
      id: al.mbid || `${al.name}-${al.artist?.name ?? i}`,
      name: al.name,
      artist: al.artist?.name || "",
      plays: parseInt(al.playcount || "0", 10),
      imageUrl: rawUrl && rawUrl.startsWith("http") ? rawUrl : null,
    };
  });

  // Genres from Apple Search lookup
  const artistNames = rawArtists.slice(0, 10).map((a) => a.name);
  const genresByName = await lookupArtistGenres(artistNames);

  const genreCounts = new Map<string, number>();
  for (const a of rawArtists) {
    const plays = parseInt(a.playcount || "1", 10);
    const g = genresByName.get(a.name.toLowerCase().trim());
    if (g) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + plays);
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const allTimeScrobbles = infoJson?.user?.playcount
    ? parseInt(infoJson.user.playcount, 10)
    : null;

  const payload: SpotifyStats = {
    connected: true,
    totalPlays,
    totalMinutes,
    allTimeScrobbles,
    topGenre: topGenres[0] ?? null,
    genres: topGenres.slice(0, 8),
    artists,
    tracks,
    albums,
  };

  return NextResponse.json(payload);
}
