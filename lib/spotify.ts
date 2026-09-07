export const SPOTIFY_SCOPES = "user-top-read";
export const PKCE_VERIFIER_KEY = "spotify_pkce_verifier";
export const PKCE_STATE_KEY = "spotify_pkce_state";

export type SpotifyTimeRange = "7day" | "1month" | "6month" | "12month";

export const SPOTIFY_TIME_RANGES: {
  id: SpotifyTimeRange;
  labelEn: string;
  labelFi: string;
}[] = [
  { id: "7day", labelEn: "7d", labelFi: "7 pv" },
  { id: "1month", labelEn: "1 mo", labelFi: "1 kk" },
  { id: "6month", labelEn: "6 mo", labelFi: "6 kk" },
  { id: "12month", labelEn: "Year", labelFi: "1 v" },
];

export function parseSpotifyTimeRange(value: string | null): SpotifyTimeRange {
  if (value === "1month" || value === "30d" || value === "1m") return "1month";
  if (value === "6month" || value === "medium_term" || value === "6m") return "6month";
  if (
    value === "12month" ||
    value === "long_term" ||
    value === "1year" ||
    value === "1y" ||
    value === "year"
  ) {
    return "12month";
  }
  return "7day";
}

export function formatListeningMinutes(
  minutes: number,
  locale: "en" | "fi"
): string {
  if (minutes < 60) {
    return locale === "fi" ? `${minutes} min` : `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) {
    return locale === "fi" ? `${h} h` : `${h}h`;
  }
  return locale === "fi" ? `${h} h ${m} min` : `${h}h ${m}m`;
}

export type MusicArtist = {
  id: string;
  name: string;
  plays: number;
};

export type MusicTrack = {
  id: string;
  name: string;
  artist: string;
  plays: number;
};

export type MusicAlbum = {
  id: string;
  name: string;
  artist: string;
  plays: number;
  imageUrl: string | null;
};

export type SpotifyStats = {
  connected: boolean;
  totalPlays: number;
  totalMinutes: number;
  allTimeScrobbles: number | null;
  topGenre: string | null;
  genres: string[];
  artists: MusicArtist[];
  tracks: MusicTrack[];
  albums: MusicAlbum[];
};

type SpotifyImage = { url: string };
type SpotifyApiArtist = {
  id: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
};
type SpotifyApiTrack = {
  id: string;
  name: string;
  artists?: { name: string }[];
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startSpotifyLogin() {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("Spotify is not configured.");
  }

  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = base64UrlEncode(new Uint8Array(digest));
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

  const redirectOrigin = new URL(redirectUri).origin;
  if (redirectOrigin !== window.location.origin) {
    window.alert(
      `Open the app at ${redirectOrigin} to connect Spotify (this address will not work).`
    );
    return;
  }

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export function takePkceFromStorage(stateFromUrl: string | null): {
  verifier: string;
} | null {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const state = sessionStorage.getItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  if (!verifier || !state || !stateFromUrl || state !== stateFromUrl) {
    return null;
  }
  return { verifier };
}
export type SpotifyArtist = MusicArtist;
export type SpotifyTrack = MusicTrack;
export type SpotifyAlbum = MusicAlbum;

