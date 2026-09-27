import { PLAYER_COLORS } from "../analysis/tracker";
import type { PlayerStats } from "../analysis/types";
import { pct } from "../lib/format";

export function PlayerCards({ players, calibrated }: { players: PlayerStats[]; calibrated: boolean }) {
  if (!players.length) {
    return <p className="muted">No players were tracked. Try calibrating the court or using the Heavy model.</p>;
  }
  return (
    <div className="player-cards">
      {players.map((p) => (
        <article key={p.playerId} className="player-card" style={{ borderTopColor: PLAYER_COLORS[p.playerId] }}>
          <header>
            <h3 style={{ color: PLAYER_COLORS[p.playerId] }}>{p.label}</h3>
            <span className="muted small">
              Team {p.team}
              {p.totalShots >= 5 && ` · likely ${p.dominantHand}-handed`}
            </span>
          </header>
          <dl className="stat-grid">
            <div>
              <dt>Distance</dt>
              <dd>
                {Math.round(p.distanceMeters)}
                <small> m{calibrated ? "" : "*"}</small>
              </dd>
            </div>
            <div>
              <dt>Top speed</dt>
              <dd>
                {(p.maxSpeed * 3.6).toFixed(1)}
                <small> km/h</small>
              </dd>
            </div>
            <div>
              <dt>Shots</dt>
              <dd>{p.totalShots}</dd>
            </div>
            <div>
              <dt>Avg. from net</dt>
              <dd>
                {p.avgNetDistance.toFixed(1)}
                <small> m</small>
              </dd>
            </div>
          </dl>
          <div className="zone-bar" aria-label="Time by court zone">
            <span className="z-net" style={{ flexGrow: p.zoneShare.net }} title={`Net ${pct(p.zoneShare.net)}`} />
            <span
              className="z-transition"
              style={{ flexGrow: p.zoneShare.transition }}
              title={`Transition ${pct(p.zoneShare.transition)}`}
            />
            <span
              className="z-baseline"
              style={{ flexGrow: p.zoneShare.baseline }}
              title={`Baseline ${pct(p.zoneShare.baseline)}`}
            />
          </div>
          <div className="zone-legend small">
            <span>Net {pct(p.zoneShare.net)}</span>
            <span>Transition {pct(p.zoneShare.transition)}</span>
            <span>Back {pct(p.zoneShare.baseline)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
