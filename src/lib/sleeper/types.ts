/**
 * Sleeper API — raw response types
 *
 * These match the actual Sleeper API JSON response structure.
 * They are used for Zod validation in schemas.ts.
 */

export interface SleeperDraftResponse {
  type: string;
  status: string;
  season: string;
  season_type: string;
  draft_id: string;
  league_id: string | null;
  name?: string;
  settings: {
    budget: number;
    teams: number;
    rounds: number;
    slots_qb: number;
    slots_rb: number;
    slots_wr: number;
    slots_te: number;
    slots_flex: number;
    slots_super_flex: number;
    slots_bn: number;
    pick_timer: number;
    nomination_timer: number;
    [key: string]: unknown;
  };
  metadata: {
    name?: string;
    scoring_type?: string;
    description?: string;
    [key: string]: unknown;
  };
  slot_to_roster_id: Record<string, number>;
  draft_order: Record<string, number>;
  start_time: number;
  last_picked: number;
  last_message_time?: number;
}

export interface SleeperPickResponse {
  draft_id: string;
  draft_slot: number;
  is_keeper: string | null;
  metadata: {
    amount: string;
    first_name: string;
    last_name: string;
    player_id: string;
    position: string;
    team: string;
    [key: string]: unknown;
  };
  pick_no: number;
  picked_by: string;
  player_id: string;
  reactions: unknown | null;
  roster_id: number;
  round: number;
}

export interface SleeperLeagueResponse {
  name: string;
  total_rosters: number;
  status: string;
  season: string;
  settings: Record<string, unknown>;
}

export interface SleeperUserResponse {
  user_id: string;
  display_name: string;
  avatar?: string;
  metadata: {
    team_name?: string;
    [key: string]: unknown;
  };
}

export interface SleeperRosterResponse {
  roster_id: number;
  owner_id: string;
  league_id: string;
  settings: Record<string, unknown>;
  starters: string[];
  players: string[];
  reserve: string[];
  metadata: Record<string, unknown>;
}
