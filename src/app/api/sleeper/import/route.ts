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

    return NextResponse.json({
      success: true,
      data: result,
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
