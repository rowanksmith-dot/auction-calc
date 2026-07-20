import { LeagueSettingsSchema, type LeagueSettings } from "../types";

export function validateSettings(data: unknown): {
  success: boolean;
  data?: LeagueSettings;
  error?: string;
} {
  const result = LeagueSettingsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
  };
}

export function validateTeamName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, "") // Sanitize HTML
    .slice(0, 30);
}
