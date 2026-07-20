/**
 * FantasyCalc Server-Side API Proxy
 *
 * This route fetches current player values from the FantasyCalc API,
 * caches them server-side, and returns normalized data to the client.
 *
 * Features:
 * - Request validation
 * - Server-side caching (in-memory, 5 minute TTL)
 * - Retries with exponential backoff
 * - Stale-cache fallback when FantasyCalc is unavailable
 * - Timestamp tracking
 * - Error handling
 */

import { NextRequest, NextResponse } from "next/server";

// ---- Types ----

interface CacheEntry {
  data: FantasyCalcResponse;
  fetchedAt: number;
  stale: boolean;
}

interface FantasyCalcResponse {
  players: Array<{
    id: number;
    name: string;
    position: string;
    maybeTeam: string | null;
    maybeAge: number;
  }>;
  values: Array<{
    playerId: number;
    value: number;
    oneQb?: number;
    ppr?: number;
    trend30?: number | null;
  }>;
  metadata: {
    timestamp: string;
    settings: Record<string, unknown>;
  };
}

interface ErrorResponse {
  error: string;
  fallback: boolean;
  cached?: boolean;
  cachedAt?: string;
  message?: string;
}

// ---- Configuration ----

const FANTASYCALC_BASE = "https://api.fantasycalc.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 8000;

// ---- In-memory cache ----

const cache = new Map<string, CacheEntry>();

// ---- Helpers ----

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  retries: number,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (response.ok) return response;
      // Non-retryable
      if (response.status === 404 || response.status === 403) return response;
    } catch (err) {
      // Network error or timeout
      if (attempt === retries) throw err;
    }
    // Wait with backoff
    await new Promise((r) =>
      setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)),
    );
  }
  throw new Error("Max retries exceeded");
}

// ---- Parallel fetch for players and values ----

async function fetchFantasyCalcData(): Promise<FantasyCalcResponse> {
  const [playersRes, valuesRes] = await Promise.all([
    fetchWithRetry(`${FANTASYCALC_BASE}/players`, MAX_RETRIES),
    fetchWithRetry(`${FANTASYCALC_BASE}/values/current`, MAX_RETRIES),
  ]);

  if (!playersRes.ok) {
    throw new Error(
      `FantasyCalc players endpoint returned ${playersRes.status}`,
    );
  }
  if (!valuesRes.ok) {
    throw new Error(
      `FantasyCalc values endpoint returned ${valuesRes.status}`,
    );
  }

  const players = await playersRes.json();
  const values = await valuesRes.json();
  const valuesArray = Array.isArray(values) ? values : values?.values ?? [];

  return {
    players,
    values: valuesArray,
    metadata: {
      timestamp: new Date().toISOString(),
      settings: {},
    },
  };
}

// The FantasyCalc API uses query parameters for league settings
async function fetchFantasyCalcValues(
  settings: Record<string, string>,
): Promise<FantasyCalcResponse> {
  const params = new URLSearchParams(settings);
  const valuesUrl = `${FANTASYCALC_BASE}/values/current?${params.toString()}`;

  const [playersRes, valuesRes] = await Promise.all([
    fetchWithRetry(`${FANTASYCALC_BASE}/players`, MAX_RETRIES),
    fetchWithRetry(valuesUrl, MAX_RETRIES),
  ]);

  if (!playersRes.ok) {
    throw new Error(
      `FantasyCalc players endpoint returned ${playersRes.status}`,
    );
  }
  if (!valuesRes.ok) {
    throw new Error(
      `FantasyCalc values endpoint returned ${valuesRes.status}`,
    );
  }

  const players = await playersRes.json();
  const values = await valuesRes.json();
  const valuesArray = Array.isArray(values) ? values : values?.values ?? [];

  return {
    players: Array.isArray(players) ? players : players?.players ?? [],
    values: valuesArray,
    metadata: {
      timestamp: new Date().toISOString(),
      settings,
    },
  };
}

// ---- Validation ----

const ALLOWED_PARAMS = [
  "isDynasty",
  "numQbs",
  "numTeams",
  "ppr",
  "tePremium",
];

function validateQueryParams(
  params: URLSearchParams,
): Record<string, string> {
  const valid: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (ALLOWED_PARAMS.includes(key)) {
      valid[key] = value;
    }
  }
  return valid;
}

// ---- Route Handler ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Validate query parameters
  const settings = validateQueryParams(searchParams);
  const cacheKey = JSON.stringify(settings) || "default";
  const now = Date.now();

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && !cached.stale && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        ...cached.data,
        _cached: true,
        _cachedAt: new Date(cached.fetchedAt).toISOString(),
        _refreshedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        },
      },
    );
  }

  // Stale cache available — return it while fetching fresh
  if (cached) {
    // Return stale and refresh in background
    fetchFantasyCalcValues(settings)
      .then((fresh) => {
        cache.set(cacheKey, {
          data: fresh,
          fetchedAt: Date.now(),
          stale: false,
        });
      })
      .catch(() => {
        // Refresh failed, mark stale but keep it
        cached.stale = true;
      });

    return NextResponse.json(
      {
        ...cached.data,
        _cached: true,
        _stale: true,
        _cachedAt: new Date(cached.fetchedAt).toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }

  // Fresh fetch
  try {
    const data = await fetchFantasyCalcValues(settings);
    cache.set(cacheKey, {
      data,
      fetchedAt: Date.now(),
      stale: false,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const error = err as Error;
    // Return fallback data
    return NextResponse.json(
      {
        error: "Failed to fetch FantasyCalc data",
        message: error.message,
        fallback: true,
      } satisfies ErrorResponse,
      { status: 503 },
    );
  }
}
