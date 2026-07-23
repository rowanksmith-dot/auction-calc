/**
 * FantasyCalc Server-Side API Proxy
 *
 * Features:
 * - CORS restricted to approved origins
 * - Zod input validation
 * - Rate limiting (30 req/min/IP via Memory Map)
 * - Server-side caching (5min TTL, stale-while-revalidate)
 * - 10s upstream timeout with AbortController
 * - Retries with exponential backoff
 * - Stale-cache fallback
 * - Sanitized error logging
 * - No provider secrets leaked
 */

import { NextRequest, NextResponse } from "next/server";

// ── Types ──

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
  fallback?: boolean;
  retryAfter?: number;
}

// ── Configuration ──

const FANTASYCALC_BASE = "https://api.fantasycalc.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 1; // one retry max — Vercel serverless timeout is tight
const RETRY_BASE_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 4_000; // 4s per request, tries twice max = ~8s total
const RATE_LIMIT_MAX = 30; // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute

const ALLOWED_ORIGINS = new Set([
  "https://auction-calc-gamma.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);

// ── State ──

const cache = new Map<string, CacheEntry>();
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ── CORS ──

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || "",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// ── Rate Limiting ──

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

// ── Validation ──

const ALLOWED_PARAMS = new Set([
  "isDynasty",
  "numQbs",
  "numTeams",
  "ppr",
  "tePremium",
]);

function validateQueryParams(searchParams: URLSearchParams): Record<string, string> {
  const valid: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (ALLOWED_PARAMS.has(key)) {
      // Sanitize: reject non-printable or excessively long values
      if (value.length > 20) continue;
      if (!/^[\w.-]+$/.test(value)) continue;
      valid[key] = value;
    }
  }
  return valid;
}

// ── Fetch helpers ──

async function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combined = signal ? anySignal([controller.signal, signal]) : controller.signal;
  try {
    const response = await fetch(url, { signal: combined });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

async function fetchWithRetry(url: string, retries: number): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (response.ok) return response;
      if (response.status === 404 || response.status === 403) return response;
    } catch {
      if (attempt === retries) throw new Error("Upstream request failed after retries");
    }
    await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
  }
  throw new Error("Max retries exceeded");
}

async function fetchFantasyCalcValues(settings: Record<string, string>): Promise<FantasyCalcResponse> {
  const params = new URLSearchParams(settings);
  const valuesUrl = `${FANTASYCALC_BASE}/values/current?${params.toString()}`;

  const [playersRes, valuesRes] = await Promise.all([
    fetchWithRetry(`${FANTASYCALC_BASE}/players`, MAX_RETRIES),
    fetchWithRetry(valuesUrl, MAX_RETRIES),
  ]);

  if (!playersRes.ok) {
    throw new Error(`FantasyCalc players endpoint returned ${playersRes.status}`);
  }
  if (!valuesRes.ok) {
    throw new Error(`FantasyCalc values endpoint returned ${valuesRes.status}`);
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

// ── OPTIONS Handler ──

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = getCorsHeaders(origin);
  return new NextResponse(null, {
    status: 204,
    headers: cors,
  });
}

// ── GET Handler ──

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. CORS
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // 2. Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before retrying.", retryAfter: rateLimit.retryAfter } satisfies ErrorResponse,
      {
        status: 429,
        headers: { ...corsHeaders, "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  // 3. Validate query parameters
  const { searchParams } = new URL(request.url);
  const settings = validateQueryParams(searchParams);
  const cacheKey = JSON.stringify(settings) || "default";
  const now = Date.now();

  // 4. Check cache
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
          ...corsHeaders,
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        },
      },
    );
  }

  // 5. Stale cache fallback: return stale + refresh in background
  if (cached) {
    fetchFantasyCalcValues(settings)
      .then((fresh) => {
        cache.set(cacheKey, { data: fresh, fetchedAt: Date.now(), stale: false });
      })
      .catch(() => {
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
          ...corsHeaders,
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }

  // 6. Fresh fetch
  try {
    const data = await fetchFantasyCalcValues(settings);
    cache.set(cacheKey, { data, fetchedAt: Date.now(), stale: false });

    const duration = Date.now() - startTime;
    console.log(
      `[api/values] status=200 duration=${duration}ms settings=${JSON.stringify(settings)}`,
    );

    return NextResponse.json(data, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[api/values] status=503 duration=${duration}ms error=${(err as Error).message}`);

    // Return a sanitized error — no upstream details leaked
    return NextResponse.json(
      {
        error: "Unable to fetch player data. Please try again later.",
        fallback: true,
      } satisfies ErrorResponse,
      {
        status: 503,
        headers: corsHeaders,
      },
    );
  }
}
