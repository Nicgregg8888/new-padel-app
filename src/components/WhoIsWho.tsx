import { useState } from "react";
import { PLAYER_COLORS } from "../analysis/tracker";
import { slotTag } from "../lib/match";

interface Props {
  ids: number[];
  photos: Record<number, string>;
  loading: boolean;
  names: Record<number, string>;
  me: number | null;
  onDone: (names: Record<number, string>, me: number | null) => void;
}

const SIDE = (id: number) => (id < 2 ? "near side" : "far side");

/** After an analysis: show each player's photo so the user can say who's who. */
export function WhoIsWho({ ids, photos, loading, names: initialNames, me: initialMe, onDone }: Props) {
  const [names, setNames] = useState(initialNames);
  const [me, setMe] = useState(initialMe);
  return (
    <section className="panel who" aria-labelledby="who-title">
      <h2 id="who-title">Which one is you?</h2>
      <p className="muted small">Tap yourself, and add names if you like. Your stats and coaching will use them.</p>
      <div className="who-grid">
        {ids.map((id) => (
          <div key={id} className={me === id ? "who-card on" : "who-card"} style={{ borderColor: me === id ? PLAYER_COLORS[id] : undefined }}>
            <button
              className="who-photo"
              aria-pressed={me === id}
              aria-label={`${names[id] || slotTag(id)} (${SIDE(id)}): this is me`}
              onClick={() => setMe(me === id ? null : id)}
            >
              {photos[id] ? (
                <img src={photos[id]} alt="" />
              ) : (
                <span className="who-placeholder" style={{ background: PLAYER_COLORS[id] }}>
                  {loading ? "…" : slotTag(id)}
                </span>
              )}
              {me === id && <span className="who-badge">That's me</span>}
            </button>
            <input
              value={names[id] ?? ""}
              placeholder={`${slotTag(id)} · ${SIDE(id)}`}
              maxLength={40}
              aria-label={`Name for ${slotTag(id)}`}
              onChange={(e) => setNames({ ...names, [id]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="row">
        <button className="primary" onClick={() => onDone(names, me)}>
          {me === null ? "Save names" : "Done"}
        </button>
        <button className="link" onClick={() => onDone(initialNames, initialMe)}>
          Skip for now
        </button>
      </div>
    </section>
  );
}
