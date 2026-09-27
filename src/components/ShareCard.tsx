import { useEffect, useState } from "react";
import type { Downloads } from "../lib/hosted";
import { HOSTED } from "../lib/hosted";
import type { MatchRecord } from "../lib/match";
import { renderShareCard } from "../lib/shareCard";

interface Props {
  match: MatchRecord;
  downloads: Downloads | null;
  onClose: () => void;
}

export function ShareCard({ match, downloads, onClose }: Props) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let url = "";
    renderShareCard(match)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [match]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filename = `${match.title.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "match"}-card.png`;
  const save = async () => {
    if (!card) return;
    if (HOSTED) {
      try {
        await downloads?.save({ filename, data: card.blob });
        setSaved(true);
      } catch {
        // Declined or unavailable: nothing to do.
      }
      return;
    }
    const a = document.createElement("a");
    a.href = card.url;
    a.download = filename;
    a.click();
    setSaved(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Match card" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Your match card</h2>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {card ? <img className="card-preview" src={card.url} alt="Match summary card" /> : !error && <p className="muted">Drawing…</p>}
        <div className="row">
          {(!HOSTED || downloads) && (
            <button className="primary" onClick={save} disabled={!card}>
              Save image
            </button>
          )}
          {saved && <span className="ok-text small">Saved</span>}
          {HOSTED && !downloads && <span className="muted small">Right-click or long-press the image to save it.</span>}
        </div>
      </div>
    </div>
  );
}
