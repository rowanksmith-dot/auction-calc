import { describe, it, expect } from "vitest";
import {
  fetchDraft,
  fetchDraftPicks,
  fetchLeague,
  fetchLeagueUsers,
  fetchLeagueRosters,
} from "@/lib/sleeper/client";
import { SleeperDraftSchema, SleeperPickSchema } from "@/lib/sleeper/schemas";
import { normalizePicks, buildTeamMap, normalizeImportResult } from "@/lib/sleeper/normalize";
import type { SleeperDraftResponse, SleeperUserResponse, SleeperRosterResponse } from "@/lib/sleeper/types";

const COMPLETED_DRAFT_ID = "1262589570407464960";

describe("Sleeper API Client", () => {
  it("fetches a completed auction draft", async () => {
    const draft = await fetchDraft(COMPLETED_DRAFT_ID);
    expect(draft.type).toBe("auction");
    expect(draft.status).toBe("complete");
    expect(draft.settings.budget).toBeGreaterThan(0);
    expect(draft.settings.teams).toBeGreaterThan(0);
  });

  it("fetches picks with auction prices", async () => {
    const picks = await fetchDraftPicks(COMPLETED_DRAFT_ID);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0].metadata.amount).toBeDefined();
    expect(Number.isFinite(parseInt(picks[0].metadata.amount, 10))).toBe(true);
  });

  it("fetches league data", async () => {
    const draft = await fetchDraft(COMPLETED_DRAFT_ID);
    if (draft.league_id) {
      const [league, users, rosters] = await Promise.all([
        fetchLeague(draft.league_id),
        fetchLeagueUsers(draft.league_id),
        fetchLeagueRosters(draft.league_id),
      ]);
      expect(league.name).toBeDefined();
      expect(users.length).toBeGreaterThan(0);
      expect(rosters.length).toBeGreaterThan(0);
    }
  });
});

describe("Schema Validation", () => {
  it("validates draft schema with passthrough", async () => {
    const parsed = SleeperDraftSchema.safeParse(await fetchDraft(COMPLETED_DRAFT_ID));
    expect(parsed.success).toBe(true);
  });

  it("validates pick schema", async () => {
    const picks = await fetchDraftPicks(COMPLETED_DRAFT_ID);
    const parsed = SleeperPickSchema.safeParse(picks[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(typeof parsed.data.metadata.amount).toBe("string");
    }
  });
});

describe("Normalizer", () => {
  it("sorts picks by price descending", async () => {
    const normalized = normalizePicks(await fetchDraftPicks(COMPLETED_DRAFT_ID));
    for (let i = 0; i < normalized.length - 1; i++) {
      expect(normalized[i].auctionPrice).toBeGreaterThanOrEqual(normalized[i + 1].auctionPrice);
    }
  });

  it("parses auction prices correctly", async () => {
    for (const p of normalizePicks(await fetchDraftPicks(COMPLETED_DRAFT_ID))) {
      expect(Number.isInteger(p.auctionPrice)).toBe(true);
      expect(p.auctionPrice).toBeGreaterThanOrEqual(0);
    }
  });

  it("builds full names", async () => {
    for (const p of normalizePicks(await fetchDraftPicks(COMPLETED_DRAFT_ID))) {
      expect(p.fullName).toMatch(/^.+ .+$/);
    }
  });

  it("builds team map from users and rosters", async () => {
    const draft = await fetchDraft(COMPLETED_DRAFT_ID);
    const [users, rosters] = await Promise.all([
      fetchLeagueUsers(draft.league_id!),
      fetchLeagueRosters(draft.league_id!),
    ]);
    const teamMap = buildTeamMap(users as unknown as SleeperUserResponse[], rosters as unknown as SleeperRosterResponse[]);
    expect(teamMap.size).toBeGreaterThan(0);
    for (const [, info] of teamMap) {
      expect(info.teamName.length).toBeGreaterThan(0);
    }
  });

  it("produces a complete import result with balanced team totals", async () => {
    const draft = await fetchDraft(COMPLETED_DRAFT_ID);
    const picks = await fetchDraftPicks(COMPLETED_DRAFT_ID);
    const [league, users, rosters] = await Promise.all([
      fetchLeague(draft.league_id!),
      fetchLeagueUsers(draft.league_id!),
      fetchLeagueRosters(draft.league_id!),
    ]);
    const result = normalizeImportResult({
      draft: draft as unknown as SleeperDraftResponse,
      picks,
      league,
      users: users as unknown as SleeperUserResponse[],
      rosters: rosters as unknown as SleeperRosterResponse[],
    });
    expect(result.draftId).toBe(COMPLETED_DRAFT_ID);
    expect(result.totalPicks).toBe(picks.length);
    expect(Object.keys(result.teams).length).toBe(12);

    for (const team of Object.values(result.teams)) {
      const sum = team.purchases.reduce((s, p) => s + p.auctionPrice, 0);
      expect(team.spent).toBe(sum);
      expect(team.remaining).toBe(team.budget - sum);
    }
  });
});
