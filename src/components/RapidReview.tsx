import { useCallback, useEffect } from "react";
import { ENDING_LABELS, PATTERN_LABELS, applyTag } from "../analysis/points";
import type { PointEnding, PointTag, Rally, Shot } from "../analysis/types";
import { fmtTime } from "../lib/format";
import { usePlayers } from "../lib/players";

interface Props {
  index: number;
  rallies: Rally[];
  shots: Shot[];
  tags: PointTag[];
  onTags: (tags: PointTag[]) => void;
  onIndex: (i: number) => void;
  /** Play this rally's clip; null when there's no video. */
  onReplay: ((r: Rally) => void) | null;
  onClose: () => void;
}

const ENDING_KEYS: Record<string, PointEnding> = { "1": "winner", "2": "forced", "3": "unforced" };

/**
 * Tag points fast: each point plays, then A/B picks the winner and 1/2/3 how
 * it ended, which moves on to the next point automatically.
 */
export function RapidReview({ index, rallies, shots, tags, onTags, onIndex, onReplay, onClose }: Props) {
  const { name } = usePlayers();
  const rally = rallies[index];
  const tag = tags.find((t) => t.rally === index);
  const teamName = (t: "A" | "B") => (t === "A" ? `${name(0)} & ${name(1)}` : `${name(2)} & ${name(3)}`);
  const done = tags.length;

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= rallies.length) return;
      onIndex(i);
    },
    [rallies.length, onIndex],
  );

  // Play each point as it comes up.
  useEffect(() => {
    if (rally) onReplay?.(rally);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const setWinner = useCallback((w: "A" | "B") => onTags(applyTag(tags, rallies, shots, index, { winner: w })), [tags, rallies, shots, index, onTags]);
  const setEnding = useCallback(
    (e: PointEnding) => {
      // Picking how it ended completes the point; the winner defaults to A only if unset.
      onTags(applyTag(tags, rallies, shots, index, { winner: tag?.winner ?? "A", ending: e }));
      if (tag?.winner) setTimeout(() => go(index + 1), 250);
    },
    [tags, rallies, shots, index, onTags, tag, go],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "b") setWinner(k.toUpperCase() as "A" | "B");
      else if (ENDING_KEYS[k] && tag?.winner) setEnding(ENDING_KEYS[k]);
      else if (k === "arrowright" || k === "enter") go(index + 1);
      else if (k === "arrowleft") go(index - 1);
      else if (k === "r" && rally) onReplay?.(rally);
      else if (k === "escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWinner, setEnding, go, index, rally, tag, onReplay, onClose]);

  if (!rally) return null;
  return (
    <div className="rapid-review" role="region" aria-label="Rapid point review">
      <div className="rr-top">
        <b>
          Point {index + 1} of {rallies.length}
        </b>
        <span className="muted small">
          {fmtTime(rally.start)} · {rally.shots} shots
          {rally.patterns?.A && ` · A ${PATTERN_LABELS[rally.patterns.A].toLowerCase()}`}
          {rally.patterns?.B && ` · B ${PATTERN_LABELS[rally.patterns.B].toLowerCase()}`}
        </span>
        <span className="muted small rr-count">{done} tagged</span>
        <button className="link small" onClick={onClose}>
          Done <kbd>Esc</kbd>
        </button>
      </div>
      <div className="rr-actions">
        <div className="rr-group" role="group" aria-label="Who won">
          {(["A", "B"] as const).map((t) => (
            <button key={t} className={tag?.winner === t ? "chip on" : "chip"} aria-pressed={tag?.winner === t} onClick={() => setWinner(t)}>
              <kbd>{t}</kbd> {teamName(t)} won
            </button>
          ))}
        </div>
        <div className="rr-group" role="group" aria-label="How it ended">
          {(Object.entries(ENDING_KEYS) as [string, PointEnding][]).map(([key, e]) => (
            <button
              key={e}
              className={tag?.ending === e && tag ? "chip on" : "chip"}
              aria-pressed={tag?.ending === e}
              disabled={!tag}
              onClick={() => setEnding(e)}
            >
              <kbd>{key}</kbd> {ENDING_LABELS[e]}
            </button>
          ))}
        </div>
        <div className="rr-group">
          <button className="ghost small" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous point">
            ← Prev
          </button>
          {onReplay && (
            <button className="ghost small" onClick={() => onReplay(rally)}>
              <kbd>R</kbd> Replay
            </button>
          )}
          <button className="primary small" onClick={() => go(index + 1)} disabled={index >= rallies.length - 1}>
            Next →
          </button>
        </div>
      </div>
      {tag && (
        <p className="small muted rr-status">
          {teamName(tag.winner)} won · {ENDING_LABELS[tag.ending]}
          {tag.by !== undefined && ` by ${name(tag.by)}`}
        </p>
      )}
    </div>
  );
}
