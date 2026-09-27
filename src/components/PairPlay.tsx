import type { TeamTactics } from "../analysis/types";
import { pct } from "../lib/format";
import { usePlayers } from "../lib/players";

/** Validated (CVD-safe, adjacent order) on the dark panel surface. */
const SEGMENTS = [
  { key: "togetherNet", label: "Together at net", color: "#199e70" },
  { key: "togetherMid", label: "Together mid-court", color: "#3987e5" },
  { key: "togetherBack", label: "Together at back", color: "#c98500" },
  { key: "staggered", label: "Staggered", color: "#9085e9" },
  { key: "split", label: "Split (one up, one back)", color: "#e66767" },
] as const;

type Tone = "good" | "warn";
interface Insight {
  tone: Tone;
  text: string;
}

export function pairInsights(t: TeamTactics): Insight[] {
  const out: Insight[] = [];
  if (t.pairedSeconds < 20) return [{ tone: "warn", text: "Too little paired footage for firm conclusions." }];
  if (t.togetherNet >= 0.35) out.push({ tone: "good", text: `Strong net control: together at the net ${pct(t.togetherNet)} of the time.` });
  else if (t.togetherNet < 0.2)
    out.push({ tone: "warn", text: `Only ${pct(t.togetherNet)} of the time at the net together. Look for chances to move up as a pair.` });
  if (t.split >= 0.15)
    out.push({ tone: "warn", text: `Split ${pct(t.split)} of the time: one up, one back leaves a gap through the middle.` });
  if (t.avgDepthGap > 3)
    out.push({ tone: "warn", text: `Partners average ${t.avgDepthGap.toFixed(1)} m apart front-to-back. Move up and back together.` });
  if (!out.length) out.push({ tone: "good", text: "Balanced positioning with no obvious pattern to fix." });
  return out;
}

export function PairPlay({ teams }: { teams: TeamTactics[] }) {
  const { name } = usePlayers();
  if (!teams.length) {
    return <p className="muted">Pair stats need both partners of a team tracked at the same time.</p>;
  }
  return (
    <div className="pair-play">
      <div className="pair-legend" aria-hidden>
        {SEGMENTS.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {teams.map((t) => {
        const [a, b] = t.team === "A" ? [0, 1] : [2, 3];
        return (
          <section key={t.team} className="pair-team">
            <h3>
              Team {t.team}{" "}
              <span className="muted">
                {name(a)} &amp; {name(b)}
              </span>
            </h3>
            <div className="pair-bar" role="img" aria-label={SEGMENTS.map((s) => `${s.label} ${pct(t[s.key])}`).join(", ")}>
              {SEGMENTS.map((s) =>
                t[s.key] > 0.005 ? (
                  <span
                    key={s.key}
                    style={{ flexGrow: t[s.key], background: s.color }}
                    title={`${s.label}: ${pct(t[s.key])}`}
                  >
                    {t[s.key] >= 0.1 ? pct(t[s.key]) : ""}
                  </span>
                ) : null,
              )}
            </div>
            <dl className="pair-stats">
              <div>
                <dt>Partner spacing</dt>
                <dd>
                  {t.avgSpacing.toFixed(1)}
                  <small> m</small>
                </dd>
              </div>
              <div>
                <dt>Front-to-back gap</dt>
                <dd>
                  {t.avgDepthGap.toFixed(1)}
                  <small> m</small>
                </dd>
              </div>
              <div>
                <dt>Net takings</dt>
                <dd>{t.netTakings}</dd>
              </div>
              <div>
                <dt>Paired time</dt>
                <dd>
                  {Math.round(t.pairedSeconds)}
                  <small> s</small>
                </dd>
              </div>
            </dl>
            <ul className="insights">
              {pairInsights(t).map((i, k) => (
                <li key={k} className={`insight ${i.tone}`}>
                  <span aria-hidden>{i.tone === "good" ? "✓" : "!"}</span>
                  <span className="sr-only">{i.tone === "good" ? "Good:" : "Watch:"}</span> {i.text}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
