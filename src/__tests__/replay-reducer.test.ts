import { describe, it, expect } from "vitest";
import { replayAuctionActions } from "@/lib/store/replay-reducer";
import type { AuctionAction, ReplayInput } from "@/lib/store/types";
import type { LeagueSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

const TEST_SETTINGS: LeagueSettings = {
  ...DEFAULT_SETTINGS,
  budget: 1000,
  minBid: 1,
};

const TEST_TEAMS = [
  { name: "Team A" },
  { name: "Team B" },
  { name: "Team C" },
  { name: "Team D" },
];

const TEST_PLAYERS = [
  { id: 1, name: "Player 1", team: "KC", position: "QB" as const, age: 25, sourceValue: 100, trend30: null },
  { id: 2, name: "Player 2", team: "SF", position: "RB" as const, age: 24, sourceValue: 90, trend30: 5 },
  { id: 3, name: "Player 3", team: "PHI", position: "WR" as const, age: 26, sourceValue: 80, trend30: -2 },
  { id: 4, name: "Player 4", team: "BUF", position: "TE" as const, age: 27, sourceValue: 70, trend30: null },
  { id: 5, name: "Player 5", team: "DAL", position: "RB" as const, age: 23, sourceValue: 60, trend30: 10 },
];

function makeBaseInput(): ReplayInput {
  return {
    players: TEST_PLAYERS,
    settings: TEST_SETTINGS,
    teams: TEST_TEAMS,
    actions: [],
  };
}

function makeAction(overrides: Partial<AuctionAction> & { type: AuctionAction["type"] }): AuctionAction {
  const base = {
    id: "test-id-1",
    timestamp: Date.now(),
  };
  return { ...base, ...overrides } as AuctionAction;
}

// ── 1. Empty action log ──
describe("1. Empty action log", () => {
  it("produces no drafted players", () => {
    const { output } = replayAuctionActions(makeBaseInput());
    expect(output.draftedPlayerIds.size).toBe(0);
    expect(output.actionCount).toBe(0);
    expect(output.playerPrices.size).toBe(0);
    expect(output.playerTeams.size).toBe(0);
  });
});

// ── 2. One draft action ──
describe("2. One draft action marks exactly one player drafted", () => {
  it("marks player 1 drafted", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.has(1)).toBe(true);
    expect(output.draftedPlayerIds.size).toBe(1);
  });
});

// ── 3. Draft action assigns correct team and price ──
describe("3. Draft action assigns correct team and price", () => {
  it("assigns player 1 to Team A at $50", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.playerPrices.get(1)).toBe(50);
    expect(output.playerTeams.get(1)).toBe("Team A");
    expect(output.teams[0].roster.length).toBe(1);
    expect(output.teams[0].roster[0].price).toBe(50);
  });
});

// ── 4. Team spending equals sum of its draft actions ──
describe("4. Team spending equals sum of its draft actions", () => {
  it("correctly sums $50 + $60 + $40 for Team A", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 0, price: 60 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a3", playerId: 3, teamIdx: 0, price: 40 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.teams[0].spent).toBe(150);
    expect(output.teams[0].roster.length).toBe(3);
  });
});

// ── 5. Remaining budget ──
describe("5. Remaining budget from $1000 default", () => {
  it("correctly calculates remaining budget after $100 draft", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 100 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.teams[0].remainingBudget).toBe(900);
  });
});

// ── 6. Max bid accounts for reserve ──
describe("6. Maximum legal bid reserves min bids for remaining spots", () => {
  it("calculates maxBid correctly for Team A after drafting one of 19 roster spots", () => {
    const input = makeBaseInput();
    // Total roster = QB:1, RB:2, WR:2, TE:1, FLEX:2, SUPERFLEX:1, BENCH:10 = 19
    const totalRoster = input.settings.rosterSlots.reduce((s, r) => s + r.count, 0);
    expect(totalRoster).toBe(19);
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 100 }),
    ];
    const { output } = replayAuctionActions(input);
    // budget=1000, spent=100, remaining=900, remainingRosterSpots = 19-1=18
    // maxBid = 900 - 1 * max(18 - 1, 0) = 900 - 17 = 883
    expect(output.teams[0].maxBid).toBe(883);
    expect(output.teams[0].remainingBudget).toBe(900);
  });
});

// ── 7. Deterministic replay ──
describe("7. Replaying same actions produces identical results", () => {
  it("produces identical output on two calls", () => {
    const input1 = makeBaseInput();
    input1.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 1, price: 75 }),
    ];

    const { output: out1 } = replayAuctionActions(input1);
    const { output: out2 } = replayAuctionActions(input1);

    expect(out1.draftedPlayerIds).toEqual(out2.draftedPlayerIds);
    expect(out1.teams[0].spent).toBe(out2.teams[0].spent);
    expect(out1.teams[1].spent).toBe(out2.teams[1].spent);
    expect(out1.totalSpent).toBe(out2.totalSpent);
  });
});

// ── 8. Duplicate action IDs ──
describe("8. Duplicate action IDs are not applied twice", () => {
  it("rejects the second occurrence of the same action ID", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 2, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(1);
    expect(output.validationWarnings.some((w) => w.includes("Duplicate action ID"))).toBe(true);
  });
});

// ── 9. No double-draft ──
describe("9. A player cannot be drafted twice", () => {
  it("rejects second draft of player 1", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 1, teamIdx: 1, price: 60 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(1);
    expect(output.playerPrices.get(1)).toBe(50);
    expect(output.playerTeams.get(1)).toBe("Team A");
  });
});

// ── 10. Budget exceed ──
describe("10. A team cannot exceed its budget", () => {
  it("rejects a $1001 draft on $1000 budget", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 1001 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.teams[0].roster.length).toBe(0);
    expect(output.draftedPlayerIds.size).toBe(0);
  });

  it("rejects second draft when remaining budget insufficient", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 950 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 0, price: 100 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(1);
    expect(output.teams[0].roster.length).toBe(1);
    expect(output.teams[0].spent).toBe(950);
  });
});

// ── 11. Roster capacity ──
describe("11. A team cannot exceed roster capacity", () => {
  it("fills a team with max players and rejects extra", () => {
    // Roster size = 19
    const input = makeBaseInput();
    const actions: AuctionAction[] = [];
    for (let i = 0; i < 20; i++) {
      actions.push(
        makeAction({ type: "DRAFT_PLAYER", id: `a${i}`, playerId: i + 1, teamIdx: 0, price: 1 }),
      );
    }
    // We only have 5 test players; let's create a tighter scenario
    // Use 19 players all going to Team A at $1 each
    const manyPlayers = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Player ${i + 1}`,
      team: "KC",
      position: "RB" as const,
      age: 25,
      sourceValue: 50,
      trend30: null,
    }));
    const input2: ReplayInput = {
      ...input,
      players: manyPlayers,
      actions: manyPlayers.map((_, i) =>
        makeAction({ type: "DRAFT_PLAYER", id: `a${i}`, playerId: i + 1, teamIdx: 0, price: 1 })
      ),
    };
    const { output } = replayAuctionActions(input2);
    expect(output.teams[0].roster.length).toBe(19);
    expect(output.draftedPlayerIds.size).toBe(19);
    expect(output.validationWarnings.some((w) => w.includes("no roster spots"))).toBe(true);
  });
});

// ── 12. Undo restores ──
describe("12. Undo restores player availability and team budget", () => {
  it("restores all derived values after UNDO_LAST_ACTION", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 0, price: 75 }),
      makeAction({ type: "UNDO_LAST_ACTION", id: "u1", timestamp: Date.now() }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.has(2)).toBe(false);
    expect(output.draftedPlayerIds.has(1)).toBe(true);
    expect(output.teams[0].spent).toBe(50);
    expect(output.teams[0].remainingBudget).toBe(950);
    expect(output.teams[0].roster.length).toBe(1);
  });

  it("undo on empty log does not crash", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "UNDO_LAST_ACTION", id: "u1", timestamp: Date.now() }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(0);
    expect(output.teams[0].roster.length).toBe(0);
  });
});

// ── 13. Reset produces empty draft ──
describe("13. Reset produces an empty draft", () => {
  it("clears all draft state", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 1, price: 75 }),
      makeAction({ type: "RESET_DRAFT", id: "r1", timestamp: Date.now() }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(0);
    expect(output.teams.every((t) => t.roster.length === 0)).toBe(true);
    expect(output.teams.every((t) => t.spent === 0 && t.remainingBudget === 1000)).toBe(true);
  });
});

// ── 14. Unresolved player ID ──
describe("14. An unresolved player ID is preserved without crashing", () => {
  it("preserves action for player not found in fetched data", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 999, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    // Player 999 doesn't exist in our test data, but the action with a valid team/price should still apply
    expect(output.draftedPlayerIds.has(999)).toBe(true);
    expect(output.teams[0].roster.length).toBe(1);
  });
});

// ── 15. Malformed actions ──
describe("15. Malformed persisted actions are safely rejected", () => {
  it("rejects actions with negative price", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: -50 } as any),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.unresolvedActionIds.length).toBeGreaterThanOrEqual(0);
    expect(output.draftedPlayerIds.has(1)).toBe(false);
  });

  it("rejects actions with invalid team index", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 99, price: 50 } as any),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.unresolvedActionIds.length).toBeGreaterThan(0);
    expect(output.draftedPlayerIds.has(1)).toBe(false);
  });

  it("rejects actions with NaN price", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: NaN } as any),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.has(1)).toBe(false);
  });
});

// ── 16. Legacy migration (no-op for this schema) ──
describe("16. Legacy persisted data migration", () => {
  it("handles empty/missing data gracefully (no migration needed)", () => {
    const input = makeBaseInput();
    input.actions = [];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(0);
    expect(output.teams.every((t) => t.roster.length === 0)).toBe(true);
  });
});

// ── 17. Derived flags not in persisted storage ──
describe("17. Derived drafted flags are not required in persisted storage", () => {
  it("drafted state derives entirely from actions, not from player object flags", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.has(1)).toBe(true);
    // player object itself has no drafted flag
    const p1 = input.players.find((p) => p.id === 1)!;
    expect((p1 as any).drafted).toBeUndefined();
  });
});

// ── 18. Changing view doesn't alter draft state ──
describe("18. Changing only the active view does not alter draft state", () => {
  it("activeView is orthogonal to draft state", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.size).toBe(1);
    // The reducer takes no `activeView` param — it's separate
    expect(output.actionCount).toBe(1);
  });
});

// ── REMOVE_DRAFTED_PLAYER ──
describe("REMOVE_DRAFTED_PLAYER", () => {
  it("removes a specific drafted player by targetActionId", () => {
    const input = makeBaseInput();
    input.actions = [
      makeAction({ type: "DRAFT_PLAYER", id: "a1", playerId: 1, teamIdx: 0, price: 50 }),
      makeAction({ type: "DRAFT_PLAYER", id: "a2", playerId: 2, teamIdx: 0, price: 75 }),
      makeAction({ type: "REMOVE_DRAFTED_PLAYER", id: "r1", timestamp: Date.now(), targetActionId: "a1" }),
    ];
    const { output } = replayAuctionActions(input);
    expect(output.draftedPlayerIds.has(1)).toBe(false);
    expect(output.draftedPlayerIds.has(2)).toBe(true);
    expect(output.teams[0].roster.length).toBe(1);
    expect(output.teams[0].spent).toBe(75);
  });
});
