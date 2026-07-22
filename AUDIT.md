# Audit Report — fix/state-persistence

Generated 2026-07-22

## 1. Internal `<a>` Links (causing full-page reloads)

### `src/app/page.tsx`
- **Line ~112**: `<a href="/how-it-works">` → plain `<a>` tag, triggers full browser reload
- **Line ~119**: `<a href="/privacy">` → plain `<a>` tag, triggers full browser reload
- **Line ~465**: `<a href="/privacy">` (footer) → plain `<a>` tag, triggers full browser reload

### Files that already use `<Link>` correctly
- `src/app/how-it-works/page.tsx` — uses `import Link from "next/link"`
- `src/app/privacy/page.tsx` — uses `import Link from "next/link"`

**External links** remain as `<a>` (correct): `fantasycalc.com`, the attribution banner anchor, and the footer "Data: FantasyCalc" link.

## 2. Full Browser Reloads

Every `<a href="/how-it-works">` and `<a href="/privacy">` in `page.tsx` causes a full document reload because plain `<a>` tags without `preventDefault` or `Link` always navigate via browser. This means:
- All React state is lost (view mode, draft progress, etc.)
- Player data is re-fetched from scratch
- Brief white flash before content renders

## 3. State Ownership (Component-Level)

| State | Owner | Persisted? |
|---|---|---|
| `settings` | `page.tsx` useState | localStorage key `auction-calc-settings` |
| `allPlayers` | `page.tsx` useState | No |
| `dataState` | `page.tsx` useState | No |
| `viewMode` | `page.tsx` useState | No |
| `favorites` | `page.tsx` useState (Set) | No |
| `draftActions` | `DraftRoom.tsx` useState | localStorage key `auction-calc-actions` |
| `teams` | `DraftRoom.tsx` useState | localStorage key `auction-calc-teams` |
| `thresholds` | `DraftRoom.tsx` useState | localStorage key `auction-calc-thresholds` |
| `teamNameInputs` | `DraftRoom.tsx` useState | No |

## 4. `onUpdatePlayers` Callback Depth

- Defined in `page.tsx` as `handleUpdatePlayers`
- Passed to `<DraftRoom>` component
- `DraftRoom` calls it in a `useEffect` that watches `draftActions` and `teams.length`
- This mutates `allPlayers` (setting `drafted`, `draftedBy`, `winningBid` props on the array objects)
- This couples `page.tsx` with `DraftRoom`'s internal state — a stale closure risk

## 5. All localStorage Keys

| Key | Set In | Purpose |
|---|---|---|
| `auction-calc-settings` | `page.tsx` (handleSaveSettings) | League settings |
| `auction-calc-actions` | `DraftRoom.tsx` (useEffect) | Draft action log |
| `auction-calc-teams` | `DraftRoom.tsx` (useEffect) | Team definitions + rosters |
| `auction-calc-thresholds` | `DraftRoom.tsx` (useEffect) | Bargain/overpay threshold config |
| `auction-calc-theme` | `ThemeToggle.tsx` | Dark/light theme preference |

## 6. `auction-calc-actions` Structure

Currently stored as a plain array of `{ playerId: number; teamIdx: number; bid: number }`. No versioning, no IDs, no timestamps, no action types. This is the core thing to upgrade.

## 7. Duplicated Drafted State

- `player.drafted` boolean is set on `allPlayers[]` in `page.tsx` via `handleToggleDrafted` AND via `DraftRoom`'s `useEffect`
- `player.winningBid` and `player.draftedBy` are derived from draft actions but stamped directly on player objects
- `teams[].players[]` in `DraftRoom` stores the full player objects again
- This is the exact architectural concern the spec identifies

## 8. State Lost on Navigation

- ALL state is lost because `<a>` reloads the page: settings (loaded from localStorage), `allPlayers` (re-fetched), `viewMode` (reset to "list"), `favorites` (reset), draft progress (`DraftRoom` stores reload from localStorage but may be stale)

## 9. State Lost on Refresh

Same as #8 — page refresh loses everything that's not in localStorage.

## 10. API Request Triggers

| Action | Trigger | Endpoint |
|---|---|---|
| Initial page load | `useEffect` on `fetchKey` | `/api/values?isDynasty=...&numQbs=...` |
| Changing format/scoring/qbFormat/numTeams | `fetchKey` changes → re-fetch | `/api/values?...` |
| Changing view (list/board/draft) | **No API call** (good) | N/A |
| Refresh button click | `handleRefresh()` → clears cache → re-fetch | `/api/values?...` |
| Drafting a player | **No API call** (good) | N/A |
| Undoing a draft | **No API call** (good) | N/A |

## 11. Redundant FantasyCalc Responses

- Same settings key causes re-fetch every time `fetchKey` changes (including on first load after page reload)
- No dedup cache for identical in-flight requests
- The in-memory cache in `adapter.ts` has 60s TTL, but server-side cache is 5min

## 12. Player Count

The full API response includes ~270+ players and ~270 values. The client merges them and filters to meaningful players (sourceValue > 0). The full list is needed for replacement calculations.

## 13. CORS

**Current state:** `src/app/api/values/route.ts` does NOT set any CORS headers. There's no `Access-Control-Allow-Origin: *`. But it also doesn't restrict origins — it simply doesn't return any CORS headers at all. The Vercel deployment likely works because it's same-origin.

## 14. Abuse-Sensitive Endpoints

| Endpoint | Risk | Existing Protection |
|---|---|---|
| `GET /api/values` | Triggers upstream FantasyCalc API calls (free but rate-limited), Vercel compute, data transfer | Server-side cache (5min TTL), retry/backoff, timeout (8s), stale-while-revalidate, Zod validation of query params |
| `GET /api/values` (with params) | Could be spammed to trigger multiple upstream calls per cache miss | No rate limiting, no IP-based protection, no auth |

## 15. Rate Limiting, Auth, etc.

- **Rate limiting**: None
- **Authentication**: None
- **Request-size limits**: None
- **Timeouts**: 8s on upstream fetch (in route.ts), 10s on adapter's fetch (in adapter.ts)
- **CORS**: No headers set at all on the API route
- **Server-side caching**: In-memory Map with 5min TTL
- **Input validation**: Zod in route.ts via `validateQueryParams` (whitelist approach)
