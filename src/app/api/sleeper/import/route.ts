/**
 * Sleeper Draft Import — API Route
 *
 * Accepts a Sleeper draft ID or URL and returns normalized draft data
 * from the Sleeper public API.
 *
 * POST /api/sleeper/import
 * Body: { draftId: string }
 *
 * Returns: { success: true, data: SleeperImportResult }
 * Errors: { success: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchAllDraftData,
  SleeperApiError,
  SleeperRateLimitError,
  SleeperTimeoutError,
} from "@/lib/sleeper/client";
import { normalizeImportResult } from "@/lib/sleeper/normalize";
import type { SleeperUserResponse, SleeperRosterResponse } from "@/lib/sleeper/types";
import type { ValidatedSleeperDraft } from "@/lib/sleeper/schemas";

// ---- Validation ----

const SLEEPER_URL_PATTERN = /^https:\/\/sleeper\.app\/draft\/nfl\/(\d+)/;
const DRAFT_ID_PATTERN = /^\d{10,}$/;

const RequestSchema = z.object({
  draftId: z.string().min(1, "Draft ID is required"),
});

/**
 * Extract numeric draft ID from various input formats.
 */
function extractDraftId(input: string): string {
  // Clean up whitespace
  const trimmed = input.trim();

  // Check if it's a full Sleeper URL
  const urlMatch = trimmed.match(SLEEPER_URL_PATTERN);
  if (urlMatch) return urlMatch[1];

  // Check if it's a raw numeric ID
  if (DRAFT_ID_PATTERN.test(trimmed)) return trimmed;

  throw new Error(
    'Invalid draft input. Provide a Sleeper draft URL (https://sleeper.app/draft/nfl/...) or a numeric draft ID.',
  );
}

// ---- Route ----

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }

    // Extract numeric draft ID
    let draftId: string;
    try {
      draftId = extractDraftId(parsed.data.draftId);
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Invalid draft ID",
        },
        { status: 400 },
      );
    }

    // Fetch all draft data from Sleeper
    const raw = await fetchAllDraftData(draftId);

    // Validate it's an auction draft
    if (raw.draft.type !== "auction") {
      return NextResponse.json(
        {
          success: false,
          error: `Draft type is "${raw.draft.type}", not "auction". Only auction drafts can be imported.`,
        },
        { status: 400 },
      );
    }

    // Normalize the data
    const result = normalizeImportResult({
      draft: raw.draft as any,
      picks: raw.picks,
      league: raw.league,
      users: raw.users as SleeperUserResponse[] | null,
      rosters: raw.rosters as SleeperRosterResponse[] | null,
    });

    // Collect all rostered player IDs (players already on rosters before the draft)
    const rosteredPlayerIds: string[] = [];
    const rosters = raw.rosters as Array<{ players?: string[] }> | null;
    if (rosters) {
      const seen = new Set<string>();
      for (const roster of rosters) {
        if (roster.players) {
          for (const pid of roster.players) {
            seen.add(pid);
          }
        }
      }
      rosteredPlayerIds.push(...seen);
    }

    // Build league settings from draft data (we already have this — no extra API call)
    const ds = raw.draft.settings;
    const leagueName = raw.league?.name ?? result.leagueName ?? "";
    const season = raw.league?.season ?? result.season ?? "";
    const status = raw.league?.status ?? result.status ?? "";
    const numTeams = raw.league?.total_rosters ?? ds.teams;

    // Scoring: detect from league scoring_settings.rec (reception points)
    // Fallback to draft.metadata.scoring_type which can be "ppr", "half", "standard",
    // or league-specific strings like "dynasty_ppr", "dynasty_2qb", etc.
    const rawLeague = raw.league as { scoring_settings?: Record<string, number> } | null;
    const rec = rawLeague?.scoring_settings?.rec;
    const scoring =
      rec === undefined || rec === null
        ? // Fallback to metadata string if league data unavailable
          (() => {
            const st = raw.draft.metadata?.scoring_type ?? "";
            if (st.includes("ppr")) return "fullPpr" as const;
            if (st.includes("half")) return "halfPpr" as const;
            return "standard" as const;
          })()
        : rec === 0
          ? ("standard" as const)
          : rec <= 0.5
            ? ("halfPpr" as const)
            : ("fullPpr" as const);

    // TE premium: detect from league scoring_settings.bonus_rec_te
    // Maps to the app's supported values: "off", "half" (0.5), "full" (1.0), "custom" (anything else)
    const bonusRecTe = rawLeague?.scoring_settings?.bonus_rec_te ?? 0;
    const tePremium =
      bonusRecTe === 0 || bonusRecTe === undefined ? ("off" as const)
      : bonusRecTe === 0.5 ? ("half" as const)
      : bonusRecTe === 1.0 ? ("full" as const)
      : ("custom" as const);
    const tePremiumCustom = bonusRecTe;

    // Taxi squad count from league settings (separate from bench in Sleeper, but counts towards bench total in auction)
    const taxiSlots = (raw.league as { settings?: Record<string, number> } | null)?.settings?.taxi_slots ?? 0;

    // Roster slots from draft settings (these use the correct sleeper key names: slots_qb, slots_rb, etc.)
    // BENCH includes taxi squad since both count towards bench spots in an auction draft
    const rosterSettings = {
      QB: ds.slots_qb,
      RB: ds.slots_rb,
      WR: ds.slots_wr,
      TE: ds.slots_te,
      FLEX: ds.slots_flex,
      SUPERFLEX: ds.slots_super_flex,
      BENCH: ds.slots_bn + taxiSlots,
    };

    // Budget from draft settings
    const budget = ds.budget;

    // QB format: if SUPERFLEX slot > 0 it's superflex, else 1QB
    const qbFormat: "superflex" | "oneQb" =
      ds.slots_super_flex > 0 ? "superflex" : "oneQb";

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        leagueSettings: {
          leagueName,
          season,
          status,
          numTeams,
          scoring,
          rosterSettings,
          budget,
          qbFormat,
          tePremium,
          tePremiumCustom,
        },
        rosteredPlayerIds,
      },
    });
  } catch (err) {
    // Handle known Sleeper errors
    if (err instanceof SleeperRateLimitError) {
      return NextResponse.json(
        {
          success: false,
          error: "Sleeper API rate limit exceeded. Please try again in a moment.",
        },
        { status: 429 },
      );
    }

    if (err instanceof SleeperTimeoutError) {
      return NextResponse.json(
        {
          success: false,
          error: "Request to Sleeper API timed out. Please try again.",
        },
        { status: 504 },
      );
    }

    if (err instanceof SleeperApiError) {
      const status = err.statusCode ?? 502;
      const message =
        status === 404
          ? "Draft not found. Check the draft ID or URL and try again."
          : `Sleeper API error: ${err.message}`;

      return NextResponse.json(
        { success: false, error: message },
        { status },
      );
    }

    // Unexpected error
    console.error("Sleeper import error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while fetching the draft.",
      },
      { status: 500 },
    );
  }
}
