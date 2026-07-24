/**
 * Sleeper API Client
 *
 * Isolated read-only client for the official Sleeper public API.
 * Uses only GET requests. No authentication required.
 */

import { z } from "zod";
import {
  SleeperDraftSchema,
  SleeperPicksArraySchema,
  SleeperLeagueSchema,
  SleeperLeagueExtendedSchema,
  SleeperUsersArraySchema,
  SleeperRostersArraySchema,
} from "./schemas";

// ---- Constants ----

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const REQUEST_TIMEOUT_MS = 10_000;

// ---- Errors ----

export class SleeperApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

export class SleeperRateLimitError extends SleeperApiError {
  constructor(endpoint: string) {
    super("Sleeper API rate limit exceeded", 429, endpoint);
    this.name = "SleeperRateLimitError";
  }
}

export class SleeperTimeoutError extends SleeperApiError {
  constructor(endpoint: string) {
    super("Sleeper API request timed out", null, endpoint);
    this.name = "SleeperTimeoutError";
  }
}

// ---- Fetch helpers ----

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SleeperTimeoutError(label);
    }
    throw new SleeperApiError(
      err instanceof Error ? err.message : "Network error",
      null,
      label,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new SleeperRateLimitError(label);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const text = await response.text().catch(() => "");
    throw new SleeperApiError(
      `Non-JSON response from Sleeper (${response.status}): ${text.substring(0, 200)}`,
      response.status,
      label,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new SleeperApiError(
      `Failed to parse JSON from Sleeper (${response.status})`,
      response.status,
      label,
    );
  }

  if (!response.ok) {
    throw new SleeperApiError(
      `Sleeper API returned ${response.status}`,
      response.status,
      label,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new SleeperApiError(
      `Schema validation failed for ${label}: ${parsed.error.message.substring(0, 200)}`,
      response.status,
      label,
    );
  }

  return parsed.data;
}

// ---- Public API ----

/**
 * Fetch draft details from Sleeper.
 */
export async function fetchDraft(draftId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/draft/${draftId}`,
    SleeperDraftSchema,
    `draft/${draftId}`,
  );
}

/**
 * Fetch all draft picks from Sleeper.
 */
export async function fetchDraftPicks(draftId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/draft/${draftId}/picks`,
    SleeperPicksArraySchema,
    `draft/${draftId}/picks`,
  );
}

/**
 * Fetch league details from Sleeper.
 */
export async function fetchLeague(leagueId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/league/${leagueId}`,
    SleeperLeagueSchema,
    `league/${leagueId}`,
  );
}

/**
 * Fetch league details with settings/scoring parsing.
 */
export async function fetchLeagueExtended(leagueId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/league/${leagueId}`,
    SleeperLeagueExtendedSchema,
    `league-extended/${leagueId}`,
  );
}

/**
 * Fetch league users from Sleeper.
 */
export async function fetchLeagueUsers(leagueId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/league/${leagueId}/users`,
    SleeperUsersArraySchema,
    `league/${leagueId}/users`,
  );
}

/**
 * Fetch league rosters from Sleeper.
 */
export async function fetchLeagueRosters(leagueId: string) {
  return fetchJson(
    `${SLEEPER_BASE}/league/${leagueId}/rosters`,
    SleeperRostersArraySchema,
    `league/${leagueId}/rosters`,
  );
}

/**
 * Fetch all available Sleeper data for a draft.
 * Returns everything in parallel where possible.
 */
export async function fetchAllDraftData(draftId: string) {
  const draft = await fetchDraft(draftId);
  const picks = await fetchDraftPicks(draftId);

  let league: Awaited<ReturnType<typeof fetchLeague>> | null = null;
  let users: Awaited<ReturnType<typeof fetchLeagueUsers>> | null = null;
  let rosters: Awaited<ReturnType<typeof fetchLeagueRosters>> | null = null;

  if (draft.league_id) {
    [league, users, rosters] = await Promise.all([
      fetchLeague(draft.league_id).catch(() => null),
      fetchLeagueUsers(draft.league_id).catch(() => null),
      fetchLeagueRosters(draft.league_id).catch(() => null),
    ]);
  }

  return { draft, picks, league, users, rosters };
}
