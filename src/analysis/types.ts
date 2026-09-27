/** A 2D point. Image points are normalized to [0,1]; court points are in meters. */
export interface Point {
  x: number;
  y: number;
}

/** Subset of a MediaPipe landmark we keep per frame. */
export interface Landmark extends Point {
  visibility: number;
}

/** One detected body in one sampled frame (33 MediaPipe landmarks). */
export type Pose = Landmark[];

export interface FramePose {
  /** Player slot this pose was assigned to (0-3), or -1 if unassigned. */
  playerId: number;
  landmarks: Pose;
  /** Feet position projected onto the court, meters. */
  court: Point;
}

export interface SampledFrame {
  t: number;
  poses: FramePose[];
}

export type ShotType =
  | "serve"
  | "forehand"
  | "backhand"
  | "forehand-volley"
  | "backhand-volley"
  | "overhead";

export interface Shot {
  t: number;
  playerId: number;
  type: ShotType;
  /** Peak wrist speed in torso-lengths per second (scale-invariant). */
  swingSpeed: number;
  /** Where on court the player hit from, meters. */
  court: Point;
  zone: CourtZone;
  /** Ball tracking saw the ball change direction at this player's racket. */
  confirmed?: boolean;
  /** Ball tracking saw the ball climb high after this shot. */
  lob?: boolean;
}

/** Ball position in one video frame, normalized image coordinates. */
export interface BallObs extends Point {
  t: number;
}

export interface BallEvent extends BallObs {
  kind: "hit" | "bounce" | "wall";
  playerId?: number;
}

export type CourtZone = "net" | "transition" | "baseline";

export interface PlayerStats {
  playerId: number;
  label: string;
  team: "A" | "B";
  distanceMeters: number;
  avgSpeed: number;
  maxSpeed: number;
  /** Seconds in which this player was tracked. */
  trackedSeconds: number;
  zoneShare: Record<CourtZone, number>;
  shots: Record<ShotType, number>;
  totalShots: number;
  avgSwingSpeed: number;
  dominantHand: "right" | "left";
  /** Occupancy grid over the court, rows = length (20), cols = width (10). Values sum to 1. */
  heatmap: number[][];
  /** Mean distance from the net in meters. */
  avgNetDistance: number;
}

export interface Rally {
  start: number;
  end: number;
  shots: number;
}

export interface TeamTactics {
  team: "A" | "B";
  /** Seconds in which both partners were tracked. */
  pairedSeconds: number;
  /** Shares of paired time (sum to 1 with staggered + split). */
  togetherNet: number;
  togetherMid: number;
  togetherBack: number;
  /** One partner a band ahead of the other (net+mid or mid+back). */
  staggered: number;
  /** One at the net, one at the back: the classic hole down the middle. */
  split: number;
  avgSpacing: number;
  avgDepthGap: number;
  avgLateralGap: number;
  /** Times the pair arrived at the net together. */
  netTakings: number;
}

export interface AnalysisResult {
  duration: number;
  sampleFps: number;
  frames: SampledFrame[];
  shots: Shot[];
  rallies: Rally[];
  players: PlayerStats[];
  teams: TeamTactics[];
  calibrated: boolean;
  /** Present when ball tracking ran. */
  ball?: { track: BallObs[]; events: BallEvent[] };
}

/** Four image points (normalized) for court corners: far-left, far-right, near-right, near-left. */
export type CourtCorners = [Point, Point, Point, Point];
