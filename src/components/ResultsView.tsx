import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "../lib/format";
import { HOSTED, claudeRuntime, type Downloads } from "../lib/hosted";
import { playerName, type MatchRecord } from "../lib/match";
import { PlayersContext } from "../lib/players";
import { CoachPanel } from "./CoachPanel";
import { CourtMap } from "./CourtMap";
import { editShot, swapPlayers } from "../analysis/corrections";
import type { Goal } from "../analysis/goals";
import { analysedSeconds } from "../analysis/reliability";
import { GoalsPanel } from "./GoalsPanel";
import { canExportVideo } from "../lib/reelExport";
import { ExportReel } from "./ExportReel";
import { RapidReview } from "./RapidReview";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { Takeaways } from "./Takeaways";
import type { Takeaway } from "../analysis/takeaways";
import { WhoIsWho } from "./WhoIsWho";
import { playerPhotos } from "../lib/photos";
import { VsUsual } from "./VsUsual";
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
  /** Apply an update to the latest version of this match (safe after async work). */
  onChange: (update: (m: MatchRecord) => MatchRecord) => void;
  onReanalyze: (() => void) | null;
  goals: Goal[];
  onGoalsChange: (g: Goal[]) => void;
}

export function ResultsView({ match, src, onChange, onReanalyze, goals, onGoalsChange }: Props) {
  const { result } = match;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [sharing, setSharing] = useState(false);
  const [review, setReview] = useState<number | null>(null);
  const [exporting, setExporting] = useState<Playlist | null>(null);
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

  const [tab, setTab] = useState<Tab>("overview");
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => setTab("overview"), [match.id]);
  const go = (section: Takeaway["section"] | Tab) => {
    const target = SECTION_TAB[section as Takeaway["section"]] ?? (section as Tab);
    setTab(target);
    // Open and scroll to a section inside the tab once it has rendered.
    requestAnimationFrame(() => {
      const el = document.getElementById(`sec-${section}`) ?? document.getElementById("results-tabs");
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Photos of each player, cut from the video once and kept with the match.
  const [photosLoading, setPhotosLoading] = useState(false);
  const needPhotos = !!src && !match.demo && !match.photos && result.frames.length > 0;
  useEffect(() => {
    if (!needPhotos || !src) return;
    let live = true;
    setPhotosLoading(true);
    playerPhotos(src, result.frames, result.players.map((p) => p.playerId)).then((photos) => {
      if (!live) return;
      setPhotosLoading(false);
      onChange((m) => ({ ...m, photos }));
    });
    return () => {
      live = false;
    };
  }, [needPhotos, src, match.id]);
  const askWho = !match.demo && !match.whoConfirmed && result.players.length > 0 && (!!src || match.me === null);

  const longest = Math.max(0, ...result.rallies.map((r) => r.shots));
  const tagged = (match.points ?? []).length;
  const nextSteps: { tab: Tab; title: string; detail: string }[] = [];
  if (result.rallies.length && tagged < result.rallies.length)
    nextSteps.push({
      tab: "points",
      title: "Who won each point?",
      detail: tagged ? `${result.rallies.length - tagged} points left to mark` : "Mark them to see your score and what wins you points",
    });
  if (match.me === null && !askWho)
    nextSteps.push({ tab: "players", title: "Which one is you?", detail: "Advice, goals and progress aimed at you" });
  if (!match.report) nextSteps.push({ tab: "coach", title: "Get coaching", detail: "An AI coach reviews your match and suggests drills" });
  if (src && result.shots.length) nextSteps.push({ tab: "highlights", title: "Watch your shots", detail: "Every forehand, volley or smash, back to back" });

  return (
    <PlayersContext.Provider value={players}>
      <div className={review !== null ? "results reviewing" : "results"}>
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
              Share
            </button>
            {(onReanalyze || !HOSTED || downloads) && (
              <details className="menu" ref={menu} onClick={(e) => {
                if ((e.target as HTMLElement).closest(".menu-list button")) menu.current?.removeAttribute("open");
              }}>
                <summary className="ghost" aria-label="More actions">
                  More
                </summary>
                <div className="menu-list">
                  {onReanalyze && <button onClick={onReanalyze}>Analyse again with other settings</button>}
                  {(!HOSTED || downloads) && <button onClick={exportJson}>Download the data (JSON)</button>}
                </div>
              </details>
            )}
          </div>
        </div>

        {src && (
          <section id="sec-video" className="panel video-panel">
            <MatchPlayer src={src} result={result} videoRef={videoRef} playlist={playlist} onPlaylistEnd={endPlaylist} />
          </section>
        )}

        <nav id="results-tabs" className="tabs" role="tablist" aria-label="Results">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "tab on" : "tab"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="tab-body" role="tabpanel">
            {askWho && (
              <WhoIsWho
                ids={result.players.map((p) => p.playerId)}
                photos={match.photos ?? {}}
                loading={photosLoading}
                names={match.names}
                me={match.me}
                onDone={(names, me) => onChange((m) => ({ ...m, names, me, whoConfirmed: true }))}
              />
            )}
            <section className="kpis">
              <Kpi
                label={result.range ? `Analysed (${fmtTime(result.range.start)}–${fmtTime(result.range.end)})` : "Match length"}
                value={fmtTime(analysedSeconds(result))}
              />
              <Kpi label="Shots" value={String(result.shots.length)} />
              <Kpi label="Points played" value={String(result.rallies.length)} />
              <Kpi label="Longest point" value={longest ? `${longest} shots` : "—"} />
              {result.ball && <Kpi label="Lobs" value={String(result.shots.filter((s) => s.lob).length)} />}
            </section>
            {!result.calibrated && (
              <p className="notice">
                The court wasn't marked, so distances and positions are rough. Use More → Analyse again and mark the
                court for accurate numbers.
              </p>
            )}
            {!src && !match.demo && (
              <p className="notice">
                This is a saved match. The video isn't stored, so clips won't play; everything else still works.
              </p>
            )}
            <Takeaways match={match} goals={goals} onGo={go} />
            {nextSteps.length > 0 && (
              <section className="next-steps" aria-label="What to do next">
                {nextSteps.map((n) => (
                  <button key={n.tab} className="next-step" onClick={() => go(n.tab)}>
                    <b>{n.title}</b>
                    <span>{n.detail}</span>
                    <span aria-hidden className="next-arrow">→</span>
                  </button>
                ))}
              </section>
            )}
            <VsUsual match={match} />
            <div className="two-col">
              <section id="sec-goals" className="panel">
                <h2>Your goals</h2>
                <GoalsPanel match={match} goals={goals} onGoalsChange={onGoalsChange} />
              </section>
              <section className="panel">
                <h2>Shot mix</h2>
                <ShotChart players={result.players} />
              </section>
            </div>
            {!match.demo && <ReliabilityPanel result={result} />}
          </div>
        )}

        {tab === "players" && (
          <div className="tab-body" role="tabpanel">
            <section id="sec-players" className="panel">
              <h2>Players</h2>
              <PlayerCards
                players={result.players}
                calibrated={result.calibrated}
                names={match.names}
                me={match.me}
                photos={match.photos}
                onRename={(id, name) => onChange((m) => ({ ...m, names: { ...m.names, [id]: name } }))}
                onSetMe={(id) => onChange((m) => ({ ...m, me: id }))}
              />
              {src && result.frames.length > 0 && result.players.length > 1 && (
                <SwapPlayers
                  players={result.players.map((p) => p.playerId)}
                  currentTime={() => videoRef.current?.currentTime ?? 0}
                  onSwap={(a, b, from) => onChange((m) => ({ ...m, result: swapPlayers(m.result, a, b, from) }))}
                />
              )}
            </section>
          </div>
        )}

        {tab === "tactics" && (
          <div className="tab-body two-col" role="tabpanel">
            <section id="sec-court" className="panel">
              <h2>Where everyone played</h2>
              <CourtMap players={result.players} shots={result.shots} onSeek={seek} />
            </section>
            <section id="sec-pair" className="panel">
              <h2>Playing as a pair</h2>
              <PairPlay teams={result.teams ?? []} />
            </section>
          </div>
        )}

        {tab === "points" && (
          <div className="tab-body" role="tabpanel">
            <section id="sec-points" className="panel">
              <h2>Points</h2>
              <PointsPanel
                onStartReview={setReview}
                golden={!!match.goldenPoint}
                onGoldenChange={(goldenPoint) => onChange((m) => ({ ...m, goldenPoint }))}
                rallies={result.rallies}
                shots={result.shots}
                tags={match.points ?? []}
                onChange={(points) => onChange((m) => ({ ...m, points }))}
                onPlay={src ? play : null}
              />
            </section>
          </div>
        )}

        {tab === "highlights" && (
          <div className="tab-body" role="tabpanel">
            <section id="sec-highlights" className="panel">
              <h2>Highlights</h2>
              <Highlights
                onExport={src && canExportVideo() ? setExporting : null}
                onEditShot={(shot, patch) => onChange((m) => ({ ...m, result: editShot(m.result, shot, patch) }))}
                shots={result.shots}
                rallies={result.rallies}
                players={result.players}
                onPlay={src ? play : null}
              />
            </section>
          </div>
        )}

        {tab === "coach" && (
          <div className="tab-body" role="tabpanel">
            <section id="sec-coach" className="panel coach">
              <h2>
                AI coach <span className="badge">Claude</span>
              </h2>
              <CoachPanel
                result={result}
                src={src}
                names={match.names}
                me={match.me}
                points={match.points ?? []}
                goldenPoint={!!match.goldenPoint}
                goals={goals}
                report={match.report ?? null}
                onReport={(report) => onChange((m) => ({ ...m, report: report ?? undefined }))}
                onSeek={seek}
              />
            </section>
          </div>
        )}
      </div>
      {review !== null && (
        <RapidReview
          index={review}
          rallies={result.rallies}
          shots={result.shots}
          tags={match.points ?? []}
          onTags={(points) => onChange((m) => ({ ...m, points }))}
          onIndex={setReview}
          onReplay={
            src
              ? (r) =>
                  play({ title: "Rapid review", clips: [{ start: r.start, end: r.end + 1, label: `${r.shots}-shot point` }] })
              : null
          }
          onClose={() => {
            setReview(null);
            setPlaylist(null);
          }}
        />
      )}
      {exporting && src && (
        <ExportReel src={src} playlist={exporting} result={result} downloads={downloads} onClose={() => setExporting(null)} />
      )}
      {sharing && <ShareCard match={match} downloads={downloads} onClose={closeShare} />}
    </PlayersContext.Provider>
  );
}

type Tab = "overview" | "players" | "tactics" | "points" | "highlights" | "coach";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["players", "Players"],
  ["tactics", "Positioning"],
  ["points", "Points"],
  ["highlights", "Highlights"],
  ["coach", "AI coach"],
];
const SECTION_TAB: Record<Takeaway["section"], Tab> = {
  points: "points",
  pair: "tactics",
  goals: "overview",
  players: "players",
  reliability: "overview",
  highlights: "highlights",
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
