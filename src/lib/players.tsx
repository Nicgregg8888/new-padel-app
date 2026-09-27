import { createContext, useContext } from "react";
import { slotTag } from "./match";

export interface PlayersInfo {
  /** Display name: what the user typed, or the slot tag (A1…B2). */
  name: (id: number) => string;
  me: number | null;
}

export const PlayersContext = createContext<PlayersInfo>({ name: slotTag, me: null });
export const usePlayers = () => useContext(PlayersContext);
