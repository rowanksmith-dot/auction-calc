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
  season: z.string(),
}).passthrough();

/**
 * Extended league schema that validates the settings and scoring_settings
 * objects used for matching roster/scoring configuration.
 */
export const SleeperLeagueExtendedSchema = SleeperLeagueSchema.extend({
  settings: z.object({
    num_teams: z.number().int().optional(),
    budget: z.number().int().optional(),
    start_week: z.number().int().optional(),
    playoff_week_start: z.number().int().optional(),
    slots_qb: z.number().int().optional(),
    slots_rb: z.number().int().optional(),
    slots_wr: z.number().int().optional(),
    slots_te: z.number().int().optional(),
    slots_flex: z.number().int().optional(),
    slots_super_flex: z.number().int().optional(),
    slots_bn: z.number().int().optional(),
  }).passthrough().optional(),
  scoring_settings: z.object({
    rec: z.number().optional(),           // reception points → PPR detection
    bonus_rec_td: z.number().optional(),  // TE premium detection
    rec_td: z.number().optional(),        // receiving TD points
    pass_td: z.number().optional(),       // passing TD
    rush_td: z.number().optional(),       // rushing TD
    pass_yd: z.number().optional(),       // passing yards per point
    rush_yd: z.number().optional(),       // rushing yards per point
    rec_yd: z.number().optional(),        // receiving yards per point
    int: z.number().optional(),           // interceptions
    sack: z.number().optional(),          // sacks
    fum_lost: z.number().optional(),      // fumbles lost
    st_td: z.number().optional(),         // special teams TD
    bonus_rec_te: z.number().optional(),  // TE premium reception bonus
    pts_allow_0: z.number().optional(),   // defense
    pts_allow_1_6: z.number().optional(),
    pts_allow_7_13: z.number().optional(),
    pts_allow_14_17: z.number().optional(),
    pts_allow_18_21: z.number().optional(),
    pts_allow_22_27: z.number().optional(),
    pts_allow_28_34: z.number().optional(),
    pts_allow_35_45: z.number().optional(),
    pts_allow_46_plus: z.number().optional(),
    blk_kick: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

export type ValidatedSleeperLeague = z.infer<typeof SleeperLeagueExtendedSchema>;

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
