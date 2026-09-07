# Dashboard spec

Personal **Dashboard** PWA for gym, books, mood, Spotify, weather, Finnish electricity, flag days, and a homelab glance. Single-user app. Gym page header shows **Liftmaxing**; home hub title is **Dashboard**.

Developer reference — update the matching section when a feature ships.

## Stack and run

- Next.js 15 App Router, React 19, Tailwind, dark UI (`brand` = `#004cff`). Tailwind `content` includes `app/`, `components/`, and `lib/` (mood fill classes live in `lib/mood.ts`).
- Supabase Auth + Postgres + RLS (anon key in the browser; no service role on Vercel)
- TanStack Query, Recharts, lucide-react
- Dev: `npm run dev` → `http://localhost:3000` (port is fixed)
- Env: copy `.env.local.example` → `.env.local`

## Layout

| Area | Role |
| --- | --- |
| `app/page.tsx` | Hub dashboard. Renders `HUB_MODULES` from `lib/hub.ts`. |
| `app/{gym,workout,books,mood,health,homelab,login}/` | Feature pages |
| `app/api/` | Server routes: electricity proxy, Spotify OAuth/stats |
| `components/hub/HubXCard.tsx` | One card per hub domain |
| `lib/*.ts` | Domain logic |
| `lib/queries.ts` | Supabase + fetch helpers used by the client |
| `types/database.ts` | Row types + generated `Database` shape |
| `supabase/schema.sql` | Full schema (same as `reset.sql` minus the “wipe” warning copy) |
| `supabase/migrate-*.sql` | Incremental SQL to run in the Supabase editor |
| `components/BottomNav.tsx` | Home, Gym, Books, Homelab |

Auth: `components/AuthProvider.tsx` redirects unknown users to `/login`. Public: `/login`, `/spotify/callback`.

Hub layout: `HubMasonry` on `app/page.tsx` packs cards into the shortest column. Column count is `floor(containerWidth / 20rem)`. Add a domain with `HubXCard` and append it in `lib/hub.ts` (order is only a placement seed). Current order: weather, electricity, mood, gym, homelab, flag-day, books, spotify.

## Product rules

- Mobile-first; verify UI in the browser (hub + any other route that shares the state).
- UI mix: English copy, Finnish dates (`formatFiDate`), comma decimals (`formatLocaleNumber`). Browser/PWA title **Dashboard**; gym page `h1` is **Liftmaxing**.
- Do not commit unless asked. Do not force-push. Do not put secrets, PDFs, or real quantities in git.

### Never commit

`.env*.local`, `supabase/seed-history.sql`, `supabase/seed-portfolio.sql`, `/backups/`, `*.pdf`. Seed examples without real positions are OK (`seed-history.example.sql`, `seed-demo.sql`).

`formatLocaleNumber(value, 0)` must **not** strip trailing zeros on integers (`1700` → `"1700"`, never `"17"`).

## Gym

Splits (Push / Pull / Legs / Upper / Run) → session → exercises → sets. Autosave on the workout page. Run logs store duration in `reps` and km in `weight_kg`. Weight/calories live in `health_logs`.

**One row per movement per session.** Template rows are keyed by `(session_id, template_slot_id)`, extra exercises by `(session_id, movement_id)` — both unique indexes. An extra exercise starts with a local random `cardId` and adopts its DB row id on first save (`lib/useActiveWorkout.ts`), which is what keeps a resumed draft from merging into a second card. `mergeCards` falls back to `sessionExerciseId` → `slotId` → `movement_id` and dedupes, so pre-existing broken drafts heal on load. Clean up old duplicates with `supabase/migrate-dedupe-session-exercises.sql`.

**Estimated 1RM (Epley, reps capped at 12) is the primary strength metric**, not top weight: 70 kg × 12 is progress over 70 kg × 10 even though the weight is flat. It drives the main line in `ProgressiveOverloadChart`, `pickBestSet`, and the direction of `formatProgressChange`. Top weight stays as a faint secondary line. Cardio movements are excluded from e1RM everywhere, since their `reps`/`weight_kg` mean minutes and km.

**Body weight trend is weekly, never daily.** `getWeightTrend` in `lib/goals.ts` is the single source for every weight card: a smoothed 7-calendar-day average vs. ~7 days earlier once there are 13+ days of logs, otherwise the raw week-over-week delta (`method: "raw"`). Goal bands are only judged against the smoothed rate. Render it with `formatWeightTrend` so the hub and gym cards cannot drift apart, and use `calendarRollingAverage` (calendar days, not entry count) for trend lines.

## Other hub cards

- **Weather:** Open-Meteo; saved location in `localStorage`. Today also shows sunrise, sunset, and day length (`daily=sunrise,sunset`).
- **Flag days:** Official + established Finnish flag-flying days from sisäministeriö (`lib/flag-days.ts`). Hub card renders **only on a flag day** (not “next flag day”). Not recommended-only days, elections, or inauguration.
- **Electricity:** FI spot via `app/api/electricity/route.ts` (spot-hinta.fi). Bar **height** is relative to today; **color** is absolute snt/kWh (VAT in): green ≤ 10, amber < 20, red ≥ 20.
- **Spotify / Music:** Last.fm API (`LASTFM_API_KEY`, `LASTFM_USERNAME`); stats via `app/api/spotify/stats`. Periods: 7d, 1mo, 6mo, year (`7day`, `1month`, `6month`, `12month`). Tracks real listening minutes, period scrobbles, top tracks & artists with playcounts, top albums with artwork, and top genre filled via Apple Search lookup (`lib/artist-genre.ts`). All-time scrobbles shown in card footer. Spotify OAuth is legacy/optional.
- **Books / mood:** `books`, `mood_logs`. Mood scores 1–5 are a heatmap (rose → orange → amber → lime → emerald) in `lib/mood.ts` for week bars and the month grid. Empty days stay `zinc-800`. Picker buttons stay gray until hover.
- **Homelab:** `/homelab` + hub card. Host is HP EliteDesk 800 G5 SFF (i5-8500T, 16 GB, 512 GB). Snapshot type in `lib/homelab.ts`; `getHomelabSnapshot()` is **null** until a Tailscale/Cloudflare tunnel exists. Do **not** poll LAN IPs from Vercel. Planned services: Immich, Joplin Server, Home Assistant, AdGuard Home. Router (ASUS RT-AX53U) later via HA `asuswrt`.

There is **no portfolio**. Drop leftover `portfolio_holdings` with `supabase/migrate-drop-portfolio.sql`.

## Data backup

`npm run backup` uses `SUPABASE_SERVICE_ROLE_KEY` locally only. Writes under `/backups/` (gitignored).
