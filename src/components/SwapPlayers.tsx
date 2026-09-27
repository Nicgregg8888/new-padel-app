import { useState } from "react";
import { fmtTime } from "../lib/format";
import { usePlayers } from "../lib/players";

interface Props {
  players: number[];
  currentTime: () => number;
  onSwap: (a: number, b: number, fromT: number) => void;
}

/** Fix identity mix-ups: from the video's current moment, swap two players. */
export function SwapPlayers({ players, currentTime, onSwap }: Props) {
  const { name } = usePlayers();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(players[0]);
  const [b, setB] = useState(players[1]);
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="link small swap-open" onClick={() => setOpen(true)}>
        Tracking mixed up two players? Fix it
      </button>
    );
  }
  return (
    <div className="swap-players" role="group" aria-label="Swap two players">
      <span className="small">
        Pause the video where the labels go wrong, then swap:
      </span>
      <select id="swap-a" aria-label="First player" value={a} onChange={(e) => setA(Number(e.target.value))}>
        {players.map((id) => (
          <option key={id} value={id}>
            {name(id)}
          </option>
        ))}
      </select>
      <span className="small">and</span>
      <select id="swap-b" aria-label="Second player" value={b} onChange={(e) => setB(Number(e.target.value))}>
        {players.map((id) => (
          <option key={id} value={id}>
            {name(id)}
          </option>
        ))}
      </select>
      <button
        className="primary small"
        disabled={a === b}
        onClick={() => {
          const t = currentTime();
          onSwap(a, b, t);
          setDone(`Swapped ${name(a)} and ${name(b)} from ${fmtTime(t)} on.`);
        }}
      >
        Swap from here
      </button>
      <button className="link small" onClick={() => setOpen(false)}>
        Close
      </button>
      {done && <span className="ok-text small">{done}</span>}
    </div>
  );
}
