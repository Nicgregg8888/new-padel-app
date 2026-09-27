import type { PlayerStats, ShotType } from "../analysis/types";
import { SHOT_COLORS, SHOT_LABELS } from "../lib/format";
import { usePlayers } from "../lib/players";

export function ShotChart({ players }: { players: PlayerStats[] }) {
  const { name } = usePlayers();
  const max = Math.max(1, ...players.map((p) => p.totalShots));
  return (
    <div className="shot-chart">
      {players.map((p) => (
        <div key={p.playerId} className="shot-row">
          <span className="shot-row-label" title={name(p.playerId)}>{name(p.playerId)}</span>
          <div className="shot-row-bar">
            {(Object.keys(SHOT_LABELS) as ShotType[]).map((t) =>
              p.shots[t] ? (
                <span
                  key={t}
                  style={{ width: `${(p.shots[t] / max) * 100}%`, background: SHOT_COLORS[t] }}
                  title={`${SHOT_LABELS[t]}: ${p.shots[t]}`}
                >
                  {p.shots[t]}
                </span>
              ) : null,
            )}
          </div>
          <span className="shot-row-total">{p.totalShots}</span>
        </div>
      ))}
    </div>
  );
}
