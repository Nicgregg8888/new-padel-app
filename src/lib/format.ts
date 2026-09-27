import type { ShotType } from "../analysis/types";

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const SHOT_LABELS: Record<ShotType, string> = {
  forehand: "Forehand",
  backhand: "Backhand",
  "forehand-volley": "FH volley",
  "backhand-volley": "BH volley",
  overhead: "Overhead",
};

export const SHOT_COLORS: Record<ShotType, string> = {
  forehand: "#38bdf8",
  backhand: "#818cf8",
  "forehand-volley": "#34d399",
  "backhand-volley": "#a3e635",
  overhead: "#fbbf24",
};
