import { z } from "zod";

/**
 * Sleeper API — Zod validation schemas
 *
 * These validate raw JSON responses from the Sleeper API.
 * The schemas are lenient enough to allow extra keys but strict
 * enough to reject malformed responses.
 */

// ---- Draft ----

export const SleeperDraftSchema = z.object({
  type: z.string(),
  status: z.string(),
  season: z.string(),
  season_type: z.string(),
  draft_id: z.string(),
  league_id: z.string().nullable(),
  settings: z.object({
    budget: z.number().int().positive(),
    teams: z.number().int().positive(),
    rounds: z.number().int().positive().default(0),
    slots_qb: z.number().int().default(1),
    slots_rb: z.number().int().default(2),
    slots_wr: z.number().int().default(2),
    slots_te: z.number().int().default(1),
    slots_flex: z.number().int().default(2),
    slots_super_flex: z.number().int().default(0),
    slots_bn: z.number().int().default(6),
  }).passthrough(),
  metadata: z.object({
    name: z.string().optional(),
    scoring_type: z.string().optional(),
  }).passthrough(),
  slot_to_roster_id: z.record(z.string(), z.number()),
  draft_order: z.record(z.string(), z.number()),
}).passthrough();

export type ValidatedSleeperDraft = z.infer<typeof SleeperDraftSchema>;

// ---- Picks ----

export const SleeperPickSchema = z.object({
  draft_id: z.string(),
  draft_slot: z.number().int(),
  is_keeper: z.string().nullable(),
  metadata: z.object({
    amount: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    player_id: z.string(),
    position: z.string(),
    team: z.string(),
  }).passthrough(),
  pick_no: z.number().int(),
  picked_by: z.string(),
  player_id: z.string(),
  roster_id: z.number().int(),
  round: z.number().int(),
}).passthrough();

export type ValidatedSleeperPick = z.infer<typeof SleeperPickSchema>;

export const SleeperPicksArraySchema = z.array(SleeperPickSchema);

// ---- League ----

export const SleeperLeagueSchema = z.object({
  name: z.string(),
  total_rosters: z.number().int(),
  status: z.string(),
}).passthrough();

// ---- Users ----

export const SleeperUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  metadata: z.object({
    team_name: z.string().optional(),
  }).passthrough(),
}).passthrough();

export const SleeperUsersArraySchema = z.array(SleeperUserSchema);

// ---- Rosters ----

export const SleeperRosterSchema = z.object({
  roster_id: z.number().int(),
  owner_id: z.string(),
  league_id: z.string(),
}).passthrough();

export const SleeperRostersArraySchema = z.array(SleeperRosterSchema);
