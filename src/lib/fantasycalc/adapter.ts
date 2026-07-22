/**
 * FantasyCalc Data Adapter
 *
 * Isolates all FantasyCalc-specific data fetching. Calls the Next.js API
 * proxy route so the server handles caching, retries, timeouts, and Zod
 * validation.
 *
 * Data sourced from FantasyCalc (https://fantasycalc.com) — computer-generated
 * fantasy football trade values.
 *
 * To change the data source, swap the implementation of getFantasyCalcData
 * while keeping the same return type.
 */

import type { LeagueSettings, PlayerWithValue } from "../types";
import fallbackValues from "@/data/fallback-values.json";

// ── Manual birthdate overrides ──
// FantasyCalc may be missing age for certain players. If a player's
// birthdate is known, set it here and their age will be computed.
const BIRTHDAYS: Record<number, { month: number; day: number; year: number }> = {
  13555: { month: 4, day: 29, year: 2004 }, // Jam Miller (RB) — April 29, 2004
};

function computeAge(b: { month: number; day: number; year: number }): number {
  const now = new Date();
  const birth = new Date(b.year, b.month - 1, b.day);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  const thisYearBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  const nextYearBday = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  const daysSince = (now.getTime() - thisYearBday.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear = (nextYearBday.getTime() - thisYearBday.getTime()) / (1000 * 60 * 60 * 24);
  const fraction = Math.max(0, Math.min(1, daysSince / daysInYear));
  return Math.round((age + fraction) * 10) / 10;
}

/** Raw FantasyCalc value record from the API response. */
export interface FantasyCalcValueRecord {
  playerId: number;
  name?: string;
  position?: string;
  team?: string;
  /** The correct source value — this is item.value, NOT overallRank or combinedValue. */
  value: number;
  overallRank?: number;
  positionRank?: number;
  trend30Day?: number | null;
  maybeTier?: number | null;
}

/** Raw player metadata from the FantasyCalc /players endpoint. */
export interface FantasyCalcApiPlayer {
  id: number;
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  maybeTeam: string | null;
  maybeAge: number;
}

interface FetchResult {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
  timestamp: string;
  fromCache: boolean;
  source: "api" | "fallback";
}

// ---- Cache ----
let fetchCache: {
  result: FetchResult;
  ts: number;
  key: string;
} | null = null;
const CACHE_TTL = 60_000; // 1 minute client-side cache

/**
 * Build the FantasyCalc query params from league settings.
 */
function buildFantasyCalcParams(settings: LeagueSettings): URLSearchParams {
  const params = new URLSearchParams();

  // Redraft vs Dynasty
  params.set("isDynasty", settings.format === "dynasty" ? "true" : "false");

  // QB format: 1QB → numQbs=1, Superflex → numQbs=2
  params.set("numQbs", settings.qbFormat === "superflex" ? "2" : "1");

  // Team count
  params.set("numTeams", String(settings.numTeams));

  // PPR
  if (settings.scoring === "standard") params.set("ppr", "0");
  else if (settings.scoring === "halfPpr") params.set("ppr", "0.5");
  else params.set("ppr", "1");

  return params;
}

/**
 * Fetch data from the Vercel API proxy route.
 * Falls back to the local dataset if the proxy fails.
 */
export async function getFantasyCalcData(
  settings: LeagueSettings,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const cacheKey = JSON.stringify(buildFantasyCalcParams(settings));

  // Check client-side cache
  const now = Date.now();
  if (fetchCache && fetchCache.key === cacheKey && now - fetchCache.ts < CACHE_TTL) {
    return fetchCache.result;
  }

  // Try via the server-side API proxy
  try {
    const params = buildFantasyCalcParams(settings);
    const url = `/api/values?${params.toString()}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) });

    if (res.ok) {
      const data = await res.json();
      const { players, values } = normalizeApiResponse(data);

      if (players.length > 0 && values.length > 0) {
        const result: FetchResult = {
          players,
          values,
          timestamp: data._refreshedAt ?? data.metadata?.timestamp ?? new Date().toISOString(),
          fromCache: !!data._cached,
          source: "api",
        };
        fetchCache = { result, ts: now, key: cacheKey };
        return result;
      }
    }
    // API returned 503 with fallback data, or empty response — fall through to local
  } catch (err) {
    console.warn("Failed to fetch from API proxy, using fallback:", err);
  }

  // Fallback: use local dataset
  const local = loadLocalFallback();
  const result: FetchResult = {
    ...local,
    timestamp: new Date().toISOString(),
    fromCache: false,
    source: "fallback",
  };
  fetchCache = { result, ts: now, key: cacheKey };
  return result;
}

/**
 * Normalize the API proxy response into typed arrays.
 * Supports both the proxy's wrapped format and direct value arrays.
 */
function normalizeApiResponse(data: any): {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
} {
  let players: FantasyCalcApiPlayer[] = [];
  let values: FantasyCalcValueRecord[] = [];

  if (data.players && Array.isArray(data.players)) {
    players = data.players
      .filter((p: any) => p && ["QB", "RB", "WR", "TE"].includes(p.position))
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position as "QB" | "RB" | "WR" | "TE",
        maybeTeam: p.maybeTeam ?? null,
        maybeAge: BIRTHDAYS[p.id] !== undefined ? computeAge(BIRTHDAYS[p.id]) : (p.maybeAge ?? 25),
      }));
  }

  // The values array from the proxy wraps per-item in a flat array
  // Each item has: playerId, value (the source value), trend30Day, overallRank, positionRank
  if (data.values && Array.isArray(data.values)) {
    values = data.values.map((v: any) => ({
      playerId: v.playerId ?? v.player?.id ?? 0,
      name: v.name ?? v.player?.name ?? "",
      position: v.position ?? v.player?.position ?? "",
      team: v.team ?? v.player?.maybeTeam ?? "",
      value: v.value ?? 0,
      overallRank: v.overallRank ?? 0,
      positionRank: v.positionRank ?? 0,
      trend30Day: v.trend30Day ?? null,
      maybeTier: v.maybeTier ?? null,
    }));
  }

  return { players, values };
}

/**
 * Merge FantasyCalc players + values into a unified list sorted by sourceValue descending.
 */
export function mergePlayersWithValues(
  players: FantasyCalcApiPlayer[],
  values: FantasyCalcValueRecord[],
): Array<{
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  trend30: number | null;
}> {
  const valueMap = new Map(values.map((v) => [v.playerId, v]));

  const merged = players
    .map((p) => {
      const v = valueMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.maybeTeam ?? "FA",
        position: p.position,
        age: BIRTHDAYS[p.id] ? computeAge(BIRTHDAYS[p.id]) : (p.maybeAge ?? 25),
        sourceValue: v?.value ?? 0,
        trend30: v?.trend30Day ?? null,
      };
    })
    .filter((p) => p.sourceValue > 0);

  // Sort descending by sourceValue (highest value first)
  merged.sort((a, b) => b.sourceValue - a.sourceValue);

  return merged;
}

/**
 * Load the local fallback dataset.
 */
function loadLocalFallback(): {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
} {
  const fallback = fallbackValues as FantasyCalcValueRecord[];

  // Build synthetic player records from the fallback values
  const players: FantasyCalcApiPlayer[] = fallback.map((v) => ({
    id: v.playerId,
    name: v.name ?? `Player ${v.playerId}`,
    position: (v.position ?? "WR") as "QB" | "RB" | "WR" | "TE",
    maybeTeam: v.team ?? "FA",
    maybeAge: 25,
  }));

  const values = fallback;

  return { players, values };
}

/** Clear the local cache (used on retry). */
export function clearDataCache(): void {
  fetchCache = null;
}
