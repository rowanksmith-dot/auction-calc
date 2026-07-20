import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

export function positionColor(position: string): string {
  switch (position) {
    case "QB":
      return "text-red-600 dark:text-red-400";
    case "RB":
      return "text-blue-600 dark:text-blue-400";
    case "WR":
      return "text-green-600 dark:text-green-400";
    case "TE":
      return "text-purple-600 dark:text-purple-400";
    default:
      return "text-gray-600";
  }
}

export function positionBgColor(position: string): string {
  switch (position) {
    case "QB":
      return "bg-red-100 dark:bg-red-900/30";
    case "RB":
      return "bg-blue-100 dark:bg-blue-900/30";
    case "WR":
      return "bg-green-100 dark:bg-green-900/30";
    case "TE":
      return "bg-purple-100 dark:bg-purple-900/30";
    default:
      return "bg-gray-100 dark:bg-gray-800";
  }
}

export function teamAbbreviation(team: string): string {
  const teamMap: Record<string, string> = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
  };
  // If already 2-3 chars, return as is
  if (team.length <= 3) return team;
  return teamMap[team] ?? team.slice(0, 3).toUpperCase();
}

export function valueIndicator(
  winningBid: number,
  auctionValue: number,
  bargainThreshold = 0.85,
  overpayThreshold = 1.15,
): { label: string; color: string } {
  if (winningBid <= 0) return { label: "", color: "" };
  const ratio = winningBid / auctionValue;
  if (ratio < bargainThreshold)
    return { label: "Bargain", color: "text-green-600 dark:text-green-400" };
  if (ratio < overpayThreshold)
    return { label: "Fair Value", color: "text-blue-600 dark:text-blue-400" };
  return { label: "Overpay", color: "text-red-600 dark:text-red-400" };
}
