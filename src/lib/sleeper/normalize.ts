/**
 * Sleeper Import — Data Normalizer
 *
 * Transforms raw Sleeper API responses (from fetchAllDraftData)
 * into a structured, normalized import result used throughout
 * AuctionCalc.
 */

import type { ValidatedSleeperPick } from "./schemas";
import type {
  SleeperDraftResponse,
  SleeperUserResponse,
  SleeperRosterResponse,
} from "./types";

// ---- Exported Types ----

/** A single auction purchase from a Sleeper draft */
export interface SleeperPurchase {
  sleeperPlayerId: string;
  fullName: string;
  position: string;
  team: string;
  auctionPrice: number; // parsed from metadata.amount string
  rosterId: number;
  pickedBy: string; // user_id
  pickNo: number;
  round: number;
}

/** Team info mapped from rosters + users */
export interface SleeperImportTeam {
  rosterId: number;
  ownerUserId: string;
  teamName: string;
  displayName: string;
  budget: number; // from draft.settings.budget
  spent: number;  // sum of purchase prices for this roster
  remaining: number; // budget - spent (can be negative if draft hasn't finished applying budget artifacts)
  purchases: SleeperPurchase[];
}

/** Full normalized import result */
export interface SleeperImportResult {
  draftId: string;
  leagueName: string;
  season: string;
  status: string; // draft.status
  budget: number;
  numTeams: number;
  totalPicks: number;
  startTime: number;
  players: SleeperPurchase[]; // flat list, sorted by auctionPrice desc
  teams: Record<number, SleeperImportTeam>; // keyed by rosterId
  playersByRoster: Record<number, SleeperPurchase[]>; // grouped by roster
  unmatchedByAuctionCalc: SleeperPurchase[]; // players not found in FC data
}

// ---- Team Map Builder ----

/**
 * Build a map from roster_id to team metadata.
 *
 * Users provide display_name and optional team_name.
 * Rosters link a roster_id to a user's owner_id.
 */
export function buildTeamMap(
  users: SleeperUserResponse[],
  rosters: SleeperRosterResponse[],
): Map<number, { ownerUserId: string; teamName: string; displayName: string }> {
  // Build lookup: user_id -> user
  const userMap = new Map<string, SleeperUserResponse>();
  for (const user of users) {
    userMap.set(user.user_id, user);
  }

  const teamMap = new Map<
    number,
    { ownerUserId: string; teamName: string; displayName: string }
  >();

  for (const roster of rosters) {
    const user = userMap.get(roster.owner_id);
    const displayName = user?.display_name ?? roster.owner_id;
    const teamName = user?.metadata?.team_name ?? displayName;

    teamMap.set(roster.roster_id, {
      ownerUserId: roster.owner_id,
      teamName,
      displayName,
    });
  }

  return teamMap;
}

// ---- Pick Normalizer ----

/**
 * Normalize an array of Sleeper draft picks into SleeperPurchase objects.
 *
 * Parses metadata.amount as an integer, builds player full name from
 * first_name + last_name, and sorts the result by auctionPrice descending.
 */
export function normalizePicks(picks: ValidatedSleeperPick[]): SleeperPurchase[] {
  if (picks.length === 0) return [];
  const purchases: SleeperPurchase[] = [];

  for (const pick of picks) {
    const auctionPrice = parseInt(pick.metadata.amount, 10);
    // If amount is missing or unparseable, treat as 0
    const price = Number.isFinite(auctionPrice) ? auctionPrice : 0;

    purchases.push({
      sleeperPlayerId: pick.metadata.player_id,
      fullName: `${pick.metadata.first_name} ${pick.metadata.last_name}`.trim(),
      position: pick.metadata.position,
      team: pick.metadata.team,
      auctionPrice: price,
      rosterId: pick.roster_id,
      pickedBy: pick.picked_by,
      pickNo: pick.pick_no,
      round: pick.round,
    });
  }

  // Sort descending by auctionPrice
  purchases.sort((a, b) => b.auctionPrice - a.auctionPrice);

  return purchases;
}

// ---- Full Import Normalizer ----

/**
 * The return shape of fetchAllDraftData from client.ts.
 *
 * Fields are Zod-validated, but we reference raw response types
 * for fields that .passthrough() makes "unknown".
 */
interface FetchAllDraftDataOutput {
  draft: SleeperDraftResponse;
  picks: ValidatedSleeperPick[];
  league: {
    name: string;
    total_rosters: number;
    status: string;
  } | null;
  users: SleeperUserResponse[] | null;
  rosters: SleeperRosterResponse[] | null;
}

/**
 * Normalize the full output of fetchAllDraftData into a structured
 * SleeperImportResult ready for downstream processing.
 */
export function normalizeImportResult(
  data: FetchAllDraftDataOutput,
): SleeperImportResult {
  const { draft, picks, league, users, rosters } = data;

  // Build team map if users and rosters are available
  const teamMap =
    users && rosters
      ? buildTeamMap(users, rosters)
      : new Map<
          number,
          { ownerUserId: string; teamName: string; displayName: string }
        >();

  // Normalize all picks
  const allPurchases = normalizePicks(picks);

  // Group purchases by rosterId
  const playersByRoster: Record<number, SleeperPurchase[]> = {};
  for (const purchase of allPurchases) {
    const list = playersByRoster[purchase.rosterId] ?? [];
    list.push(purchase);
    playersByRoster[purchase.rosterId] = list;
  }

  // Build team records with budget accounting
  const budget = draft.settings.budget;
  const teams: Record<number, SleeperImportTeam> = {};

  // Collect all roster IDs present in picks
  const rosterIdsFromPicks = new Set(allPurchases.map((p) => p.rosterId));

  // Also include roster IDs from the roster data itself
  if (rosters) {
    for (const roster of rosters) {
      rosterIdsFromPicks.add(roster.roster_id);
    }
  }

  for (const rosterId of rosterIdsFromPicks) {
    const teamInfo = teamMap.get(rosterId);
    const teamPurchases = playersByRoster[rosterId] ?? [];
    const spent = teamPurchases.reduce(
      (sum, p) => sum + p.auctionPrice,
      0,
    );
    const remaining = budget - spent;

    teams[rosterId] = {
      rosterId,
      ownerUserId: teamInfo?.ownerUserId ?? `roster_${rosterId}`,
      teamName: teamInfo?.teamName ?? `Team ${rosterId}`,
      displayName: teamInfo?.displayName ?? `Team ${rosterId}`,
      budget,
      spent,
      remaining,
      purchases: teamPurchases,
    };
  }

  return {
    draftId: draft.draft_id,
    leagueName: league?.name ?? draft.metadata?.name ?? "Unknown League",
    season: draft.season,
    status: draft.status,
    budget,
    numTeams: draft.settings.teams,
    totalPicks: allPurchases.length,
    startTime: draft.start_time,
    players: allPurchases,
    teams,
    playersByRoster,
    unmatchedByAuctionCalc: [], // populated upstream by callers doing FC lookup
  };
}
