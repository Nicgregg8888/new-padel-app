import { useMemo, useState } from "react";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { PlayerStats, Rally, Shot, ShotType } from "../analysis/types";
import { SHOT_COLORS, SHOT_LABELS, fmtTime } from "../lib/format";
import { usePlayers } from "../lib/players";
import type { Playlist } from "./MatchPlayer";

interface Props {
  shots: Shot[];
  rallies: Rally[];
  players: PlayerStats[];
  /** Null when there's no video to play (a saved match). */
  onPlay: ((p: Playlist) => void) | null;
}

type Sort = "time" | "power";
const SHOT_TYPES = Object.keys(SHOT_LABELS) as ShotType[];
const LIST_LIMIT = 40;

export function Highlights({ shots, rallies, players, onPlay }: Props) {
  const { name, me } = usePlayers();
  const [who, setWho] = useState<number | "all">(me ?? "all");
  const [types, setTypes] = useState<Set<ShotType>>(new Set());
  const [sort, setSort] = useState<Sort>("time");

  const filtered = useMemo(() => {
    const list = shots.filter((s) => (who === "all" || s.playerId === who) && (!types.size || types.has(s.type)));
    return sort === "power" ? [...list].sort((a, b) => b.swingSpeed - a.swingSpeed) : list;
  }, [shots, who, types, sort]);

  const topRallies = useMemo(() => [...rallies].sort((a, b) => b.shots - a.shots).slice(0, 5), [rallies]);

  const toggleType = (t: ShotType) => {
    const next = new Set(types);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setTypes(next);
  };

  const filterLabel = [
    who === "all" ? "Everyone" : name(who),
    types.size ? [...types].map((t) => SHOT_LABELS[t]).join(", ") : "all shots",
  ].join(" · ");

  const playShots = (list: Shot[], title: string) =>
    onPlay?.({
      title,
      clips: list.map((s) => ({
        start: Math.max(0, s.t - 1.5),
        end: s.t + 1.2,
        label: `${fmtTime(s.t)} ${name(s.playerId)} ${SHOT_LABELS[s.type].toLowerCase()}`,
      })),
    });

  return (
    <div className="highlights">
      <div className="chips" role="group" aria-label="Player">
        <button className={who === "all" ? "chip on" : "chip"} onClick={() => setWho("all")}>
          Everyone
        </button>
        {players.map((p) => (
          <button
            key={p.playerId}
            className={who === p.playerId ? "chip on" : "chip"}
            style={{ "--chip": PLAYER_COLORS[p.playerId] } as React.CSSProperties}
            onClick={() => setWho(p.playerId)}
          >
            {name(p.playerId)}
            {me === p.playerId && " ★"}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Shot type">
        {SHOT_TYPES.map((t) => (
          <button
            key={t}
            className={types.has(t) ? "chip on" : "chip"}
            style={{ "--chip": SHOT_COLORS[t] } as React.CSSProperties}
            aria-pressed={types.has(t)}
            onClick={() => toggleType(t)}
          >
            {SHOT_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="row between highlights-actions">
        <label className="inline-select">
          Sort
          <select id="highlight-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="time">By time</option>
            <option value="power">Hardest swings first</option>
          </select>
        </label>
        {onPlay && (
          <button className="primary small" disabled={!filtered.length} onClick={() => playShots(filtered, filterLabel)}>
            ▶ Play all {filtered.length}
          </button>
        )}
      </div>

      {filtered.length ? (
        <ul className="shot-list">
          {filtered.slice(0, LIST_LIMIT).map((s, i) => (
            <li key={`${s.t}-${i}`}>
              <button
                className="shot-item"
                disabled={!onPlay}
                onClick={() => playShots([s], `${name(s.playerId)} ${SHOT_LABELS[s.type].toLowerCase()}`)}
              >
                <span className="time">{fmtTime(s.t)}</span>
                <i style={{ background: SHOT_COLORS[s.type] }} aria-hidden />
                <span className="what">
                  <b style={{ color: PLAYER_COLORS[s.playerId] }}>{name(s.playerId)}</b> {SHOT_LABELS[s.type]}
                </span>
                <span className="muted small">{s.zone}</span>
                <span className="power" title="Swing speed, torso-lengths per second">
                  {s.swingSpeed.toFixed(0)}
                </span>
              </button>
            </li>
          ))}
          {filtered.length > LIST_LIMIT && (
            <li className="muted small">+ {filtered.length - LIST_LIMIT} more (included in Play all)</li>
          )}
        </ul>
      ) : (
        <p className="muted">No shots match these filters.</p>
      )}

      {topRallies.length > 0 && (
        <>
          <h3 className="mt-sm">Longest rallies</h3>
          <ul className="rally-list">
            {topRallies.map((r, i) => (
              <li key={i}>
                <button
                  className="time-link"
                  disabled={!onPlay}
                  onClick={() =>
                    onPlay?.({
                      title: "Rally",
                      clips: [{ start: r.start, end: r.end, label: `${r.shots}-shot rally at ${fmtTime(r.start)}` }],
                    })
                  }
                >
                  ▶ {fmtTime(r.start)}
                </button>
                <span>{r.shots} shots</span>
                <span className="muted">{(r.end - r.start).toFixed(0)}s</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
