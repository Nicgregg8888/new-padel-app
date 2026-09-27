import { useState } from "react";
import { COURT_LENGTH, COURT_WIDTH } from "../analysis/court";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { PlayerStats, Shot } from "../analysis/types";
import { courtLines } from "../lib/draw";
import { SHOT_COLORS, SHOT_LABELS, fmtTime } from "../lib/format";
import { usePlayers } from "../lib/players";

interface Props {
  players: PlayerStats[];
  shots: Shot[];
  onSeek: (t: number) => void;
}

export function CourtMap({ players, shots, onSeek }: Props) {
  const { name } = usePlayers();
  const [selected, setSelected] = useState<number | "all">("all");
  const [showShots, setShowShots] = useState(true);

  const shown = selected === "all" ? players : players.filter((p) => p.playerId === selected);
  // Combine heatmaps; each cell keeps the colour of whoever spent the most time there.
  const cells: { r: number; c: number; v: number; color: string }[] = [];
  let max = 0;
  for (let r = 0; r < COURT_LENGTH; r++) {
    for (let c = 0; c < COURT_WIDTH; c++) {
      let v = 0;
      let top = -1;
      let topV = 0;
      for (const p of shown) {
        const x = p.heatmap[r][c];
        v += x;
        if (x > topV) {
          topV = x;
          top = p.playerId;
        }
      }
      if (v > 0) cells.push({ r, c, v, color: PLAYER_COLORS[top] });
      max = Math.max(max, v);
    }
  }
  const visibleShots = shots.filter((s) => selected === "all" || s.playerId === selected);

  return (
    <div className="court-map">
      <div className="chips">
        <button className={selected === "all" ? "chip on" : "chip"} onClick={() => setSelected("all")}>
          All players
        </button>
        {players.map((p) => (
          <button
            key={p.playerId}
            className={selected === p.playerId ? "chip on" : "chip"}
            style={{ "--chip": PLAYER_COLORS[p.playerId] } as React.CSSProperties}
            onClick={() => setSelected(p.playerId)}
          >
            {name(p.playerId)}
          </button>
        ))}
        <label className="toggle small">
          <input id="court-shots-toggle" type="checkbox" checked={showShots} onChange={(e) => setShowShots(e.target.checked)} />
          Shots
        </label>
      </div>
      <svg viewBox="-1.5 -1.5 13 23" className="court-svg" role="img" aria-label="Court heatmap">
        <rect x={-1.5} y={-1.5} width={13} height={23} className="court-surround" />
        <rect x={0} y={0} width={COURT_WIDTH} height={COURT_LENGTH} className="court-surface" />
        {cells.map(({ r, c, v, color }) => (
          <rect
            key={`${r}-${c}`}
            x={c}
            y={r}
            width={1}
            height={1}
            fill={color}
            opacity={0.15 + 0.75 * Math.sqrt(v / max)}
          />
        ))}
        {courtLines().map(([a, b], i) => (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={i === 4 ? "net-line" : "court-line"} />
        ))}
        {showShots &&
          visibleShots.map((s, i) => (
            <circle
              key={i}
              cx={s.court.x}
              cy={s.court.y}
              r={0.28}
              fill={SHOT_COLORS[s.type]}
              className="shot-dot"
              onClick={() => onSeek(Math.max(0, s.t - 1))}
            >
              <title>{`${fmtTime(s.t)} · ${name(s.playerId)} · ${SHOT_LABELS[s.type]}`}</title>
            </circle>
          ))}
        <text x={5} y={-0.5} className="court-label">
          Team B (far)
        </text>
        <text x={5} y={21.1} className="court-label">
          Team A (near / camera)
        </text>
      </svg>
    </div>
  );
}
