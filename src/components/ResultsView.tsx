import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "../lib/format";
import { HOSTED, claudeRuntime, type Downloads } from "../lib/hosted";
import { playerName, type MatchRecord } from "../lib/match";
import { PlayersContext } from "../lib/players";
import { CoachPanel } from "./CoachPanel";
import { CourtMap } from "./CourtMap";
import { editShot, swapPlayers } from "../analysis/corrections";
import { analysedSeconds } from "../analysis/reliability";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { Highlights } from "./Highlights";
import { SwapPlayers } from "./SwapPlayers";
import { MatchPlayer, type Playlist } from "./MatchPlayer";
import { PairPlay } from "./PairPlay";
import { PointsPanel } from "./PointsPanel";
import { PlayerCards } from "./PlayerCards";
import { ShareCard } from "./ShareCard";
import { ShotChart } from "./ShotChart";

interface Props {
  match: MatchRecord;
  /** The match video, or null when viewing a saved match from history. */
  src: string | null;
  onChange: (m: MatchRecord) => void;
  onReanalyze: (() => void) | null;
}

export function ResultsView({ match, src, onChange, onReanalyze }: Props) {
  const { result } = match;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [sharing, setSharing] = useState(false);
  const closeShare = useCallback(() => setSharing(false), []);
  const endPlaylist = useCallback(() => setPlaylist(null), []);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    setPlaylist(null);
    v.currentTime = t;
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const play = (p: Playlist) => {
    setPlaylist(p);
    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Hosted pages can't start downloads themselves; they ask the Claude viewer to save the file.
  const [downloads, setDownloads] = useState<Downloads | null>(null);
  useEffect(() => {
    if (!HOSTED) return;
    let live = true;
    claudeRuntime()
      ?.use("downloads")
      .then((d) => live && setDownloads(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const exportJson = () => {
    const { frames: _frames, ...summary } = result;
    const json = JSON.stringify({ title: match.title, names: match.names, ...summary, report: match.report }, null, 2);
    const filename = `${match.title.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "")}-analysis.json`;
    if (HOSTED) {
      downloads?.save({ filename, data: json }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const players = useMemo(
    () => ({ name: (id: number) => playerName(match, id), me: match.me }),
    [match],
  );

  const avgRally = result.rallies.length
    ? result.rallies.reduce((a, r) => a + r.shots, 0) / result.rallies.length
    : 0;

  return (
    <PlayersContext.Provider value={players}>
      <div className="results">
        <div className="results-head">
          <div>
            <h1 className="match-title">{match.title}</h1>
            <p className="muted small">
              {match.demo
                ? "Simulated match to show what PadelVision finds. Nothing here is saved."
                : `Analysed ${new Date(match.createdAt).toLocaleString()} · saved in this browser`}
            </p>
          </div>
          <div className="kpi-actions">
            <button className="primary" onClick={() => setSharing(true)}>
              Match card
            </button>
            {onReanalyze && (
              <button className="ghost" onClick={onReanalyze}>
                Re-analyze
              </button>
            )}
            {(!HOSTED || downloads) && (
              <button className="ghost" onClick={exportJson}>
                Export JSON
              </button>
            )}
          </div>
        </div>
        <section className="kpis">
          <Kpi
            label={result.range ? `Analysed (${fmtTime(result.range.start)}–${fmtTime(result.range.end)})` : "Duration"}
            value={fmtTime(analysedSeconds(result))}
          />
          <Kpi label="Players tracked" value={String(result.players.length)} />
          <Kpi label="Shots detected" value={String(result.shots.length)} />
          <Kpi label="Rallies" value={String(result.rallies.length)} />
          <Kpi label="Avg. rally" value={avgRally ? `${avgRally.toFixed(1)} shots` : "—"} />
          {result.ball && (
            <>
              <Kpi label="Shots seen by ball tracking" value={String(result.shots.filter((s) => s.confirmed).length)} />
              <Kpi label="Lobs" value={String(result.shots.filter((s) => s.lob).length)} />
            </>
          )}
        </section>
        {!result.calibrated && (
          <p className="notice">
            Court not calibrated: distances, speeds and positions are approximate. Re-analyze and mark the court
            corners for accurate numbers.
          </p>
        )}
        {!match.demo && <ReliabilityPanel result={result} />}
        {!src && !match.demo && (
          <p className="notice">
            Viewing a saved match. The video isn't stored, so playback and highlights clips are off; stats, the
            court map and the coach all still work.
          </p>
        )}

        <div className="results-grid">
          {src && (
            <section className="panel span-2">
              <MatchPlayer
                src={src}
                result={result}
                videoRef={videoRef}
                playlist={playlist}
                onPlaylistEnd={endPlaylist}
              />
            </section>
          )}

          <section className={src ? "panel" : "panel span-2"}>
            <h2>Court map</h2>
            <CourtMap players={result.players} shots={result.shots} onSeek={seek} />
          </section>

          {!src && (
            <section className="panel">
              <h2>Shot mix</h2>
              <ShotChart players={result.players} />
            </section>
          )}

          <section className="panel span-3">
            <h2>Players</h2>
            <PlayerCards
              players={result.players}
              calibrated={result.calibrated}
              names={match.names}
              me={match.me}
              onRename={(id, name) => onChange({ ...match, names: { ...match.names, [id]: name } })}
              onSetMe={(id) => onChange({ ...match, me: id })}
            />
            {src && result.frames.length > 0 && result.players.length > 1 && (
              <SwapPlayers
                players={result.players.map((p) => p.playerId)}
                currentTime={() => videoRef.current?.currentTime ?? 0}
                onSwap={(a, b, from) => onChange({ ...match, result: swapPlayers(result, a, b, from) })}
              />
            )}
          </section>

          <section className="panel span-2">
            <h2>Pair play</h2>
            <PairPlay teams={result.teams ?? []} />
          </section>


          {src ? (
            <section className="panel">
              <h2>Shot mix</h2>
              <ShotChart players={result.players} />
            </section>
          ) : (
            <section className="panel">
              <h2>Rallies</h2>
              <p className="muted">
                {result.rallies.length} rallies, longest {Math.max(0, ...result.rallies.map((r) => r.shots))} shots.
              </p>
            </section>
          )}

          <section className="panel span-3">
            <h2>Points</h2>
            <PointsPanel
              rallies={result.rallies}
              shots={result.shots}
              tags={match.points ?? []}
              onChange={(points) => onChange({ ...match, points })}
              onPlay={src ? play : null}
            />
          </section>

          <section className="panel">
            <h2>Highlights</h2>
            <Highlights
              onEditShot={(shot, patch) => onChange({ ...match, result: editShot(result, shot, patch) })}
              shots={result.shots} rallies={result.rallies} players={result.players} onPlay={src ? play : null} />
          </section>

          <section className="panel span-2 coach">
            <h2>
              AI coach <span className="badge">Claude</span>
            </h2>
            <CoachPanel
              result={result}
              src={src}
              names={match.names}
              me={match.me}
              points={match.points ?? []}
              report={match.report ?? null}
              onReport={(report) => onChange({ ...match, report: report ?? undefined })}
              onSeek={seek}
            />
          </section>
        </div>
      </div>
      {sharing && <ShareCard match={match} downloads={downloads} onClose={closeShare} />}
    </PlayersContext.Provider>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
