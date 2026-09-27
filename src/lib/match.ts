import type { CoachReport } from "../../shared/coach";
import { playerIdentity } from "../analysis/tracker";
import { demoPointTags } from "../analysis/demo";
import type { AnalysisResult, PointTag } from "../analysis/types";

/** Everything we keep about one analysed match. */
export interface MatchRecord {
  id: string;
  title: string;
  createdAt: number;
  result: AnalysisResult;
  /** Player id -> name the user typed. */
  names: Record<number, string>;
  /** Which player the user is, if they said. */
  me: number | null;
  report?: CoachReport;
  /** The user's calls on how each rally ended. */
  points?: PointTag[];
  /** Games are decided by a golden point at 40-40 (no advantage). */
  goldenPoint?: boolean;
  /** Simulated sample data, never saved. */
  demo?: boolean;
}

export function newMatch(title: string, result: AnalysisResult, prev?: Pick<MatchRecord, "names" | "me">): MatchRecord {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: Date.now(),
    result,
    names: prev?.names ?? {},
    me: prev?.me ?? null,
  };
}

/** Short tag like "A1". */
export const slotTag = (id: number) => playerIdentity(id).label.split(" ")[0];

/** The player's name if set, otherwise their slot tag. */
export function playerName(m: Pick<MatchRecord, "names">, id: number): string {
  return m.names[id]?.trim() || slotTag(id);
}

export function demoMatch(result: AnalysisResult): MatchRecord {
  return {
    id: "demo",
    title: "Demo match (sample data)",
    createdAt: Date.now(),
    result,
    names: { 0: "You", 1: "Partner", 2: "Rival 1", 3: "Rival 2" },
    me: 0,
    points: demoPointTags(result),
    demo: true,
  };
}
