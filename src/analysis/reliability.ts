import type { AnalysisResult } from "./types";

export type Grade = "good" | "fair" | "poor";

export interface Reliability {
  grade: Grade;
  /** Share of the analysed time each player was tracked. */
  coverage: { playerId: number; share: number }[];
  /** Share of the analysed time the ball was being followed (null when ball tracking was off). */
  ballCoverage: number | null;
  /** Share of detected swings the ball confirmed (null when there's no ball data). */
  confirmedShare: number | null;
  tips: string[];
}

/** Seconds actually analysed (a chosen segment, or the whole video). */
export function analysedSeconds(r: Pick<AnalysisResult, "duration" | "range">): number {
  return r.range ? Math.max(r.range.end - r.range.start, 1e-3) : Math.max(r.duration, 1e-3);
}

/** How much to trust this analysis, and what would make the next one better. */
export function assessReliability(r: AnalysisResult): Reliability {
  const secs = analysedSeconds(r);
  const coverage = [0, 1, 2, 3].map((id) => ({
    playerId: id,
    share: Math.min(1, (r.players.find((p) => p.playerId === id)?.trackedSeconds ?? 0) / secs),
  }));

  let ballCoverage: number | null = null;
  if (r.ball && r.ball.track.length) {
    let covered = 0;
    const tr = r.ball.track;
    for (let i = 1; i < tr.length; i++) {
      const dt = tr[i].t - tr[i - 1].t;
      if (dt > 0 && dt < 0.2) covered += dt;
    }
    ballCoverage = Math.min(1, covered / secs);
  }
  const confirmedShare =
    r.ball && r.shots.length ? r.shots.filter((s) => s.confirmed).length / r.shots.length : null;

  const tips: string[] = [];
  const near = (coverage[0].share + coverage[1].share) / 2;
  const far = (coverage[2].share + coverage[3].share) / 2;
  const minShare = Math.min(...coverage.map((c) => c.share));
  if (minShare < 0.5) {
    tips.push(
      "Some players were lost for long stretches. Film from higher up behind a baseline so all four stay in view, and try the Full model.",
    );
  }
  if (far < near * 0.6) {
    tips.push("Far-side players were hard to see. Use 1080p or higher, or zoom so the court fills the frame.");
  }
  if (!r.calibrated) tips.push("Mark the court corners so distances, speeds and positions are measured in meters.");
  if (ballCoverage !== null && ballCoverage < 0.15) {
    tips.push("The ball was rarely visible. Good light, 60 fps recording and not filming into the sun all help.");
  }
  if (confirmedShare !== null && ballCoverage !== null && ballCoverage >= 0.15 && confirmedShare < 0.3) {
    tips.push("Many detected swings weren't confirmed by the ball. Check them in Highlights and fix or remove the wrong ones.");
  }

  const avg = coverage.reduce((a, c) => a + c.share, 0) / 4;
  const grade: Grade = avg >= 0.75 && minShare >= 0.5 && r.calibrated ? "good" : avg >= 0.45 ? "fair" : "poor";
  return { grade, coverage, ballCoverage, confirmedShare, tips };
}
