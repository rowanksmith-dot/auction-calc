"use client";

import { useState } from "react";
import { Settings, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeagueSettings, RosterSlotType } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

interface SettingsPanelProps {
  settings: LeagueSettings;
  onChange: (settings: LeagueSettings) => void;
}

const TEAM_OPTIONS = [8, 10, 12, 14, 16] as const;
const BUDGET_PRESETS = [100, 200, 500, 1000, 2000] as const;
const MIN_BID_PRESETS = [1, 2, 5, 10] as const;

const POSITION_LABELS: Record<RosterSlotType, string> = {
  QB: "Quarterback",
  RB: "Running Back",
  WR: "Wide Receiver",
  TE: "Tight End",
  FLEX: "Flex (RB/WR/TE)",
  SUPERFLEX: "Superflex (QB/RB/WR/TE)",
  BENCH: "Bench",
};

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function update<K extends keyof LeagueSettings>(
    key: K,
    value: LeagueSettings[K],
  ) {
    onChange({ ...settings, [key]: value });
  }

  function updateRosterSlot(index: number, count: number) {
    const slots = [...settings.rosterSlots];
    slots[index] = { ...slots[index], count: Math.max(0, count) };
    onChange({ ...settings, rosterSlots: slots });
  }

  function getRosterCount(type: RosterSlotType): number {
    return (
      settings.rosterSlots.find((s) => s.type === type)?.count ?? 0
    );
  }

  function setRosterCount(type: RosterSlotType, count: number) {
    const idx = settings.rosterSlots.findIndex((s) => s.type === type);
    if (idx >= 0) updateRosterSlot(idx, count);
  }

  const [manualRosterOverride, setManualRosterOverride] = useState<number | null>(null);

  const totalRoster = manualRosterOverride ?? settings.rosterSlots.reduce(
    (s, r) => s + r.count,
    0,
  );

  function handleSuperflexToggle(enabled: boolean) {
    const current = settings.rosterSlots.find((s) => s.type === "SUPERFLEX");
    if (enabled && !current) {
      // Add superflex slot when enabling
      onChange({
        ...settings,
        qbFormat: "superflex",
        rosterSlots: [
          ...settings.rosterSlots,
          { type: "SUPERFLEX" as const, count: 1 },
        ],
      });
    } else if (!enabled && current) {
      // Remove superflex slot when disabling
      onChange({
        ...settings,
        qbFormat: "oneQb",
        rosterSlots: settings.rosterSlots.filter(
          (s) => s.type !== "SUPERFLEX",
        ),
      });
    } else {
      update("qbFormat", enabled ? "superflex" : "oneQb");
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Settings size={20} className="text-primary" />
        <h2 className="text-lg font-semibold flex-1">League Settings</h2>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-5">
          {/* Format & Size Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                League Format
              </label>
              <select
                value={settings.format}
                onChange={(e) =>
                  update("format", e.target.value as "redraft" | "dynasty")
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="redraft">Redraft</option>
                <option value="dynasty">Dynasty Startup</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Number of Teams
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {TEAM_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => update("numTeams", n)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      settings.numTeams === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={4}
                  max={32}
                  value={
                    TEAM_OPTIONS.includes(settings.numTeams as 8 | 10 | 12 | 14 | 16)
                      ? ""
                      : settings.numTeams
                  }
                  placeholder="Custom"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 4 && v <= 32) update("numTeams", v);
                  }}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Scoring Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Scoring
              </label>
              <div className="flex gap-1.5">
                {[
                  { value: "standard", label: "Standard" },
                  { value: "halfPpr", label: "Half PPR" },
                  { value: "fullPpr", label: "Full PPR" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      update(
                        "scoring",
                        opt.value as "standard" | "halfPpr" | "fullPpr",
                      )
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      settings.scoring === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                QB Format
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => update("qbFormat", "oneQb")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    settings.qbFormat === "oneQb"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  1QB
                </button>
                <button
                  onClick={() => handleSuperflexToggle(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    settings.qbFormat === "superflex"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  Superflex
                </button>
              </div>
            </div>
          </div>

          {/* TE Premium */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              TE Premium
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { value: "off", label: "Off" },
                { value: "half", label: "+0.5 / Rec" },
                { value: "full", label: "+1.0 / Rec" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    update(
                      "tePremium",
                      opt.value as "off" | "half" | "full" | "custom",
                    )
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    settings.tePremium === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {opt.label}
                </button>
              ))}
              {settings.tePremium === "custom" && (
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.5}
                  value={settings.tePremiumCustom}
                  onChange={(e) =>
                    update("tePremiumCustom", parseFloat(e.target.value) || 0)
                  }
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                />
              )}
            </div>
          </div>

          {/* Budget Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Budget Per Team ($)
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {BUDGET_PRESETS.map((b) => (
                  <button
                    key={b}
                    onClick={() => update("budget", b)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      settings.budget === b
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    ${b}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={
                    BUDGET_PRESETS.includes(settings.budget as 100 | 200 | 500 | 1000 | 2000)
                      ? ""
                      : settings.budget
                  }
                  placeholder="Custom"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v > 0) update("budget", v);
                  }}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Minimum Bid ($)
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {MIN_BID_PRESETS.map((b) => (
                  <button
                    key={b}
                    onClick={() => update("minBid", b)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      settings.minBid === b
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    ${b}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={
                    MIN_BID_PRESETS.includes(settings.minBid as 1 | 2 | 5 | 10)
                      ? ""
                      : settings.minBid
                  }
                  placeholder="Custom"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 0) update("minBid", v);
                  }}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Roster Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm font-medium">Roster Configuration</label>
              <input
                type="number"
                min={1}
                max={60}
                value={manualRosterOverride ?? totalRoster}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v > 0) {
                    setManualRosterOverride(v);
                  } else {
                    setManualRosterOverride(null);
                  }
                }}
                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                title="Total roster spots (override auto-calculated)"
              />
              <span className="text-xs text-muted-foreground">
                total spots
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[ "QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX", "BENCH" ].map(
                (pos) => {
                  const count = getRosterCount(pos as RosterSlotType);
                  if (
                    pos === "SUPERFLEX" &&
                    settings.qbFormat !== "superflex"
                  )
                    return null;
                  return (
                    <div
                      key={pos}
                      className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border border-border"
                    >
                      <span className="text-sm font-medium">{pos}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setRosterCount(
                              pos as RosterSlotType,
                              Math.max(0, count - 1),
                            )
                          }
                          className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {count}
                        </span>
                        <button
                          onClick={() =>
                            setRosterCount(
                              pos as RosterSlotType,
                              Math.min(20, count + 1),
                            )
                          }
                          className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* Advanced */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle size={14} />
              Advanced Settings
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showAdvanced && (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1.5">
                  Exponent (higher = more money to elite players)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={settings.exponent}
                    onChange={(e) =>
                      update("exponent", parseFloat(e.target.value))
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-10 text-right">
                    {settings.exponent.toFixed(2)}
                  </span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => update("exponent", 0.85)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      settings.exponent === 0.85
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    0.85 — Flatter
                  </button>
                  <button
                    type="button"
                    onClick={() => update("exponent", 1.0)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      settings.exponent === 1.0
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    1.0 — Balanced
                  </button>
                  <button
                    type="button"
                    onClick={() => update("exponent", 1.15)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      settings.exponent === 1.15
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    )}
                  >
                    1.15 — Stars & Scrubs
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Default: 1.0 (Balanced). Lower values spread money more
                  evenly; higher values concentrate it on top players.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
