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

export interface AnalysisResult {
  duration: number;
  sampleFps: number;
  frames: SampledFrame[];
  shots: Shot[];
  rallies: Rally[];
  players: PlayerStats[];
  calibrated: boolean;
}

/** Four image points (normalized) for court corners: far-left, far-right, near-right, near-left. */
export type CourtCorners = [Point, Point, Point, Point];
