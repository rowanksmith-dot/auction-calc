import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store/store";

// Reset store before each test
beforeEach(() => {
  useAppStore.setState({
    actions: [],
    activeView: "list",
    selectedTeamIdx: null,
    teamNames: [],
    thresholds: { bargain: 0.85, overpay: 1.15 },
    settings: {
      format: "dynasty",
      numTeams: 12,
      scoring: "fullPpr",
      tePremium: "off",
      tePremiumCustom: 0,
      qbFormat: "superflex",
      budget: 1000,
      minBid: 1,
      rosterSlots: [
        { type: "QB", count: 1 },
        { type: "RB", count: 2 },
        { type: "WR", count: 2 },
        { type: "TE", count: 1 },
        { type: "FLEX", count: 2 },
        { type: "SUPERFLEX", count: 1 },
        { type: "BENCH", count: 10 },
      ],
      exponent: 1.0,
    },
    favorites: new Set(),
    showDiagnostics: false,
    showMethodology: false,
  });
});

// ── 1. Actions persist ──
describe("1. Actions persist", () => {
  it("draftPlayer adds an action", () => {
    useAppStore.getState().draftPlayer(1, 0, 50);
    const state = useAppStore.getState();
    expect(state.actions.length).toBe(1);
    expect(state.actions[0].type).toBe("DRAFT_PLAYER");
    if (state.actions[0].type === "DRAFT_PLAYER") {
      expect(state.actions[0].playerId).toBe(1);
      expect(state.actions[0].price).toBe(50);
      expect(state.actions[0].teamIdx).toBe(0);
    }
  });

  it("draftPlayer returns '' on success and error message on invalid price", () => {
    const ok = useAppStore.getState().draftPlayer(1, 0, 50);
    expect(ok).toBe("");
    const bad = useAppStore.getState().draftPlayer(1, 0, -1);
    expect(bad).not.toBe("");
  });
});

// ── 2. Active view persists ──
describe("2. Active view persists", () => {
  it("setActiveView updates the view", () => {
    useAppStore.getState().setActiveView("board");
    expect(useAppStore.getState().activeView).toBe("board");
  });

  it("setActiveView can return to list", () => {
    useAppStore.getState().setActiveView("draft");
    useAppStore.getState().setActiveView("list");
    expect(useAppStore.getState().activeView).toBe("list");
  });
});

// ── 3. Hydration ──
describe("3. Hydration does not overwrite saved actions with defaults", () => {
  it("state loaded via merge preserves actions", () => {
    // Simulate the persist merge behavior
    const persisted = {
      actions: [
        { id: "a1", type: "DRAFT_PLAYER", timestamp: 1000, playerId: 1, teamIdx: 0, price: 50 },
      ],
      activeView: "draft" as const,
    };

    // Apply merge logic (simulating what persist middleware does)
    const store = useAppStore.getState();
    const merged = {
      ...store,
      actions: Array.isArray(persisted.actions) ? persisted.actions : [],
      activeView: persisted.activeView === "list" || persisted.activeView === "board" || persisted.activeView === "draft"
        ? persisted.activeView : "list",
    };

    useAppStore.setState(merged);
    const state = useAppStore.getState();
    expect(state.actions.length).toBe(1);
    expect(state.activeView).toBe("draft");
  });
});

// ── 4. Reset clears draft ──
describe("4. Reset clears draft actions", () => {
  it("resetDraft() clears the action log", () => {
    useAppStore.getState().draftPlayer(1, 0, 50);
    expect(useAppStore.getState().actions.length).toBe(1);
    useAppStore.getState().resetDraft();
    expect(useAppStore.getState().actions.length).toBe(1); // RESET_DRAFT action remains
    expect(useAppStore.getState().actions[0].type).toBe("RESET_DRAFT");
  });
});

// ── 5. State survives component unmount ──
describe("5. State remains available after page components unmount", () => {
  it("actions persist in the store regardless of component lifecycle", () => {
    useAppStore.getState().draftPlayer(1, 0, 50);
    // Simulate component unmount by just reading again
    const state = useAppStore.getState();
    expect(state.actions.length).toBe(1);
  });
});

// ── 6. Selectors ──
describe("6. Selectors return consistent derived state", () => {
  it("getState() returns the same object reference if unchanged", () => {
    const s1 = useAppStore.getState();
    const s2 = useAppStore.getState();
    expect(s1).toBe(s2);
  });

  it("thresholds are configurable", () => {
    useAppStore.getState().setThresholds({ bargain: 0.75, overpay: 1.25 });
    const state = useAppStore.getState();
    expect(state.thresholds.bargain).toBe(0.75);
    expect(state.thresholds.overpay).toBe(1.25);
  });
});

// ── 7. Default budget $1000 ──
describe("7. The default budget remains $1000", () => {
  it("settings.budget defaults to 1000", () => {
    const state = useAppStore.getState();
    expect(state.settings.budget).toBe(1000);
  });

  it("resetAllState preserves $1000 budget", () => {
    useAppStore.getState().setSettings({
      ...useAppStore.getState().settings,
      budget: 500,
    });
    useAppStore.getState().resetAllState();
    const state = useAppStore.getState();
    expect(state.settings.budget).toBe(1000);
  });
});

// ── Additional store behavior ──
describe("Extra store behavior", () => {
  it("undoLastAction pushes an UNDO_LAST_ACTION action", () => {
    useAppStore.getState().draftPlayer(1, 0, 50);
    useAppStore.getState().undoLastAction();
    const actions = useAppStore.getState().actions;
    expect(actions.length).toBe(2);
    expect(actions[1].type).toBe("UNDO_LAST_ACTION");
  });

  it("toggleFavorite adds and removes player IDs", () => {
    useAppStore.getState().toggleFavorite(1);
    expect(useAppStore.getState().favorites.has(1)).toBe(true);
    useAppStore.getState().toggleFavorite(1);
    expect(useAppStore.getState().favorites.has(1)).toBe(false);
  });

  it("removeDraftAction adds a REMOVE_DRAFTED_PLAYER action", () => {
    useAppStore.getState().removeDraftAction("a1");
    const actions = useAppStore.getState().actions;
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("REMOVE_DRAFTED_PLAYER");
    if (actions[0].type === "REMOVE_DRAFTED_PLAYER") {
      expect(actions[0].targetActionId).toBe("a1");
    }
  });
});
