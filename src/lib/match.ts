import type { CoachReport } from "../../shared/coach";
import { playerIdentity } from "../analysis/tracker";
import type { AnalysisResult } from "../analysis/types";

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
