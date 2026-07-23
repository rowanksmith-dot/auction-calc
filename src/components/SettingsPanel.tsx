"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
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

/** Style: a selected pill button */
function PillButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
        selected
          ? "bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-sm"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:ring-1 hover:ring-border",
      )}
    >
      {children}
    </button>
  );
}

/** A number input used for custom values. Gets a visible "Custom" ring when filled. */
function PresetInput({
  value,
  isActive,
  onChange,
  min,
  max,
  placeholder,
}: {
  value: number | string;
  isActive: boolean;
  onChange: (v: number) => void;
  min: number;
  max: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      placeholder={placeholder || "Custom"}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      className={cn(
        "w-20 rounded-lg border-2 px-2 py-1.5 text-sm bg-background transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]",
        isActive
          ? "border-primary/50 bg-primary/5 text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground/30",
      )}
    />
  );
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function update<K extends keyof LeagueSettings>(
    key: K,
    value: LeagueSettings[K],
  ) {
    onChange({ ...settings, [key]: value });
  }

  function handleSuperflexToggle(enabled: boolean) {
    const slotSettings = [...settings.rosterSlots];
    const sfIdx = slotSettings.findIndex((s) => s.type === "SUPERFLEX");
    if (enabled && sfIdx === -1) {
      slotSettings.push({ type: "SUPERFLEX", count: 1 });
    } else if (!enabled && sfIdx !== -1) {
      slotSettings.splice(sfIdx, 1);
    }
    onChange({
      ...settings,
      qbFormat: enabled ? "superflex" : "oneQb",
      rosterSlots: slotSettings,
    });
  }

  function getRosterCount(type: RosterSlotType): number {
    return settings.rosterSlots.find((s) => s.type === type)?.count ?? 0;
  }

  function setRosterCount(type: RosterSlotType, count: number) {
    const slots = [...settings.rosterSlots];
    const idx = slots.findIndex((s) => s.type === type);
    if (idx >= 0) {
      slots[idx] = { ...slots[idx], count };
    } else {
      slots.push({ type, count });
    }
    onChange({ ...settings, rosterSlots: slots });
  }

  const totalRoster = settings.rosterSlots.reduce((s, r) => s + r.count, 0);

  const hasCustomTeams = !TEAM_OPTIONS.includes(settings.numTeams as 8 | 10 | 12 | 14 | 16);
  const hasCustomBudget = !BUDGET_PRESETS.includes(settings.budget as 100 | 200 | 500 | 1000 | 2000);
  const hasCustomMinBid = !MIN_BID_PRESETS.includes(settings.minBid as 1 | 2 | 5 | 10);

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <h2 className="text-lg font-semibold flex-1">League Settings</h2>
        {expanded ? <ChevronUp size={20} className="text-muted-foreground" /> : <ChevronDown size={20} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-5">
          {/* Format & Size Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold mb-1.5">
                League Format
              </label>
              <div className="flex gap-1.5">
                <PillButton
                  selected={settings.format === "redraft"}
                  onClick={() => update("format", "redraft")}
                >
                  Redraft
                </PillButton>
                <PillButton
                  selected={settings.format === "dynasty"}
                  onClick={() => update("format", "dynasty")}
                >
                  Dynasty
                </PillButton>
              </div>
            </div>

            <div>
              <label className="block text-base font-semibold mb-1.5">
                Number of Teams
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                {TEAM_OPTIONS.map((n) => (
                  <PillButton
                    key={n}
                    selected={settings.numTeams === n}
                    onClick={() => update("numTeams", n)}
                  >
                    {n}
                  </PillButton>
                ))}
                <PresetInput
                  value={
                    hasCustomTeams
                      ? settings.numTeams
                      : ""
                  }
                  isActive={hasCustomTeams}
                  onChange={(v) => update("numTeams", v)}
                  min={4}
                  max={32}
                />
              </div>
            </div>
          </div>

          {/* Scoring Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold mb-1.5">
                Scoring
              </label>
              <div className="flex gap-1.5">
                {[
                  { value: "standard", label: "Standard" },
                  { value: "halfPpr", label: "Half PPR" },
                  { value: "fullPpr", label: "Full PPR" },
                ].map((opt) => (
                  <PillButton
                    key={opt.value}
                    selected={settings.scoring === opt.value}
                    onClick={() =>
                      update(
                        "scoring",
                        opt.value as "standard" | "halfPpr" | "fullPpr",
                      )
                    }
                  >
                    {opt.label}
                  </PillButton>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-base font-semibold mb-1.5">
                QB Format
              </label>
              <div className="flex gap-1.5">
                <PillButton
                  selected={settings.qbFormat === "oneQb"}
                  onClick={() => handleSuperflexToggle(false)}
                >
                  1QB
                </PillButton>
                <PillButton
                  selected={settings.qbFormat === "superflex"}
                  onClick={() => handleSuperflexToggle(true)}
                >
                  Superflex
                </PillButton>
              </div>
            </div>
          </div>

          {/* TE Premium */}
          <div>
            <label className="block text-base font-semibold mb-1.5">
              TE Premium
            </label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {[
                { value: "off", label: "Off" },
                { value: "half", label: "+0.5 / Rec" },
                { value: "full", label: "+1.0 / Rec" },
              ].map((opt) => (
                <PillButton
                  key={opt.value}
                  selected={settings.tePremium === opt.value}
                  onClick={() =>
                    update(
                      "tePremium",
                      opt.value as "off" | "half" | "full" | "custom",
                    )
                  }
                >
                  {opt.label}
                </PillButton>
              ))}
              <PillButton
                selected={settings.tePremium === "custom"}
                onClick={() =>
                  update("tePremium", "custom")
                }
              >
                Custom
              </PillButton>
              {settings.tePremium === "custom" && (
                <div className="flex items-center gap-1 ml-1">
                  <span className="text-xs text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.5}
                    value={settings.tePremiumCustom}
                    onChange={(e) =>
                      update("tePremiumCustom", parseFloat(e.target.value) || 0)
                    }
                    className={cn(
                      "w-16 rounded-lg border-2 px-2 py-1.5 text-sm bg-background text-center transition-all duration-150",
                      "focus:outline-none focus:ring-2 focus:ring-primary",
                      settings.tePremiumCustom !== 0
                        ? "border-primary/50 bg-primary/5"
                        : "border-border",
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Budget Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold mb-1.5">
                Budget Per Team ($)
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                {BUDGET_PRESETS.map((b) => (
                  <PillButton
                    key={b}
                    selected={settings.budget === b}
                    onClick={() => update("budget", b)}
                  >
                    ${b}
                  </PillButton>
                ))}
                <PresetInput
                  value={
                    hasCustomBudget
                      ? settings.budget
                      : ""
                  }
                  isActive={hasCustomBudget}
                  onChange={(v) => update("budget", v)}
                  min={1}
                  max={10000}
                />
              </div>
            </div>

            <div>
              <label className="block text-base font-semibold mb-1.5">
                Minimum Bid ($)
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                {MIN_BID_PRESETS.map((b) => (
                  <PillButton
                    key={b}
                    selected={settings.minBid === b}
                    onClick={() => update("minBid", b)}
                  >
                    ${b}
                  </PillButton>
                ))}
                <PresetInput
                  value={
                    hasCustomMinBid
                      ? settings.minBid
                      : ""
                  }
                  isActive={hasCustomMinBid}
                  onChange={(v) => update("minBid", v)}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>

          {/* Roster Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm font-medium">Roster Configuration</label>
              <span className="text-xs text-muted-foreground">
                ({totalRoster} total spots)
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
                          className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center text-sm font-bold transition-colors"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums font-medium">
                          {count}
                        </span>
                        <button
                          onClick={() =>
                            setRosterCount(
                              pos as RosterSlotType,
                              count + 1,
                            )
                          }
                          className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center text-sm font-bold transition-colors"
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

          {/* Advanced Section */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle size={14} />
              {showAdvanced ? "Hide" : "Show"} Advanced Settings
              {showAdvanced ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-base font-semibold mb-1.5">
                    Auction Value Curve (Exponent)
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
                      className="flex-1 accent-primary"
                    />
                    <span className={cn(
                      "text-sm font-mono w-10 text-right tabular-nums",
                      settings.exponent !== 1.0 && "text-primary font-bold",
                    )}>
                      {settings.exponent.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <PillButton
                      selected={settings.exponent === 0.85}
                      onClick={() => update("exponent", 0.85)}
                    >
                      0.85 — Flatter
                    </PillButton>
                    <PillButton
                      selected={settings.exponent === 1.0}
                      onClick={() => update("exponent", 1.0)}
                    >
                      1.0 — Balanced
                    </PillButton>
                    <PillButton
                      selected={settings.exponent === 1.15}
                      onClick={() => update("exponent", 1.15)}
                    >
                      1.15 — Stars & Scrubs
                    </PillButton>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Default: 1.0 (Balanced). Lower = flatter prices, higher = more
                    money to elite players.
                  </p>
                </div>

                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => onChange(DEFAULT_SETTINGS)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Reset all settings to defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
