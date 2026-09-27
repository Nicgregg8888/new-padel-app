import { COURT_WIDTH, NET_Y } from "./court";
import type { Point, SampledFrame } from "./types";

export const MAX_PLAYERS = 4;
/** Fastest plausible player movement, m/s, plus slack for pose jitter. */
const MAX_PLAYER_SPEED = 8;
const MATCH_SLACK_M = 1.5;
/** A slot unseen for this long may be taken over by a new detection. */
const STALE_AFTER_S = 2;
/** However long a player was unseen, don't match them to someone further away than this. */
const MAX_GATE_M = 4;

const side = (p: Point) => (p.y > NET_Y ? 1 : -1);
/** Players never cross the net. */
const sameSide = (a: Point, b: Point) => side(a) === side(b);
/** After a cut in edited footage, anyone on the same side may match. */
const CUT_GATE_M = 20;

interface Slot {
  pos: Point;
  lastT: number;
}

/**
 * Frame-to-frame identity tracking in court space. Padel has exactly four
 * players who rarely cross each other, so greedy nearest-neighbour matching
 * with a speed gate is robust enough.
 */
export class PlayerTracker {
  private slots: Slot[] = [];
  private afterCut = false;

  /**
   * The video cut to another moment (edited highlights, a new rally): players
   * jump, so the next frame is matched by side and nearest position only.
   */
  cut() {
    this.afterCut = true;
  }

  /** Start from known positions (resuming a saved analysis): slot ids are kept. */
  seed(t: number, players: { id: number; pos: Point }[]) {
    for (const { id, pos } of players) {
      if (id < 0 || id >= MAX_PLAYERS) continue;
      while (this.slots.length <= id) this.slots.push({ pos: { x: -99, y: -99 }, lastT: -Infinity });
      this.slots[id] = { pos, lastT: t };
    }
  }

  /** Players seen recently but not at time `t`: candidates for a closer look. */
  missing(t: number, within = 5): { id: number; pos: Point }[] {
    return this.slots
      .map((slot, id) => ({ id, slot }))
      .filter(({ slot }) => Number.isFinite(slot.lastT) && slot.lastT < t && t - slot.lastT <= within)
      .map(({ id, slot }) => ({ id, pos: slot.pos }));
  }

  /** Record a sighting found by a targeted search for player `id`. */
  confirm(id: number, t: number, pos: Point): boolean {
    const slot = this.slots[id];
    if (!slot || !Number.isFinite(slot.lastT)) return false;
    const gate = Math.min(MAX_GATE_M, MAX_PLAYER_SPEED * Math.max(t - slot.lastT, 0) + MATCH_SLACK_M);
    if (!sameSide(slot.pos, pos) || Math.hypot(pos.x - slot.pos.x, pos.y - slot.pos.y) > gate) return false;
    this.slots[id] = { pos, lastT: t };
    return true;
  }

  /** Returns the slot index for each detection, or -1 if it was rejected. */
  assign(t: number, detections: Point[]): number[] {
    const result = new Array<number>(detections.length).fill(-1);
    const pairs: { s: number; d: number; dist: number }[] = [];
    this.slots.forEach((slot, s) => {
      if (!Number.isFinite(slot.lastT)) return; // placeholder from seed(): only re-acquired below
      const gate = this.afterCut
        ? CUT_GATE_M
        : Math.min(MAX_GATE_M, MAX_PLAYER_SPEED * Math.max(t - slot.lastT, 0) + MATCH_SLACK_M);
      detections.forEach((det, d) => {
        if (!sameSide(slot.pos, det)) return;
        const dist = Math.hypot(det.x - slot.pos.x, det.y - slot.pos.y);
        if (dist <= gate) pairs.push({ s, d, dist });
      });
    });
    pairs.sort((a, b) => a.dist - b.dist);

    const usedSlots = new Set<number>();
    for (const { s, d } of pairs) {
      if (usedSlots.has(s) || result[d] !== -1) continue;
      usedSlots.add(s);
      result[d] = s;
    }

    detections.forEach((det, d) => {
      if (result[d] !== -1) return;
      // Two players per side: a third track on one side is a spectator or a ghost.
      const onSide = this.slots.filter((sl) => Number.isFinite(sl.lastT) && side(sl.pos) === side(det)).length;
      if (this.slots.length < MAX_PLAYERS && onSide < 2) {
        this.slots.push({ pos: det, lastT: t });
        usedSlots.add(this.slots.length - 1);
        result[d] = this.slots.length - 1;
        return;
      }
      // Re-acquire a player we lost track of (occlusion, left frame) on the same half.
      let best = -1;
      let bestDist = Infinity;
      this.slots.forEach((slot, s) => {
        if (usedSlots.has(s) || t - slot.lastT < STALE_AFTER_S) return;
        if (Number.isFinite(slot.lastT) && slot.pos.y > NET_Y !== det.y > NET_Y) return;
        const dist = Math.hypot(det.x - slot.pos.x, det.y - slot.pos.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = s;
        }
      });
      if (best !== -1) {
        usedSlots.add(best);
        result[d] = best;
      }
    });

    result.forEach((s, d) => {
      if (s !== -1) this.slots[s] = { pos: detections[d], lastT: t };
    });
    if (detections.length) this.afterCut = false;
    return result;
  }
}

/** Remove near-duplicate detections of the same body (closer than `minDist` meters), keeping the earliest. */
export function dedupeDetections(points: Point[], minDist = 0.8): number[] {
  const keep: number[] = [];
  points.forEach((p, i) => {
    if (keep.every((k) => Math.hypot(points[k].x - p.x, points[k].y - p.y) >= minDist)) {
      keep.push(i);
    }
  });
  return keep;
}

export interface PlayerIdentity {
  team: "A" | "B";
  label: string;
}

/**
 * Renumber tracker slots so ids are stable and meaningful:
 * 0 = near-left, 1 = near-right (team A), 2 = far-left, 3 = far-right (team B).
 * Returns the old->new id map.
 */
export function canonicalPlayerOrder(frames: SampledFrame[]): Map<number, number> {
  const sums = new Map<number, { x: number; y: number; n: number }>();
  for (const f of frames) {
    for (const p of f.poses) {
      if (p.playerId < 0) continue;
      const s = sums.get(p.playerId) ?? { x: 0, y: 0, n: 0 };
      s.x += p.court.x;
      s.y += p.court.y;
      s.n += 1;
      sums.set(p.playerId, s);
    }
  }
  const means = [...sums.entries()].map(([id, s]) => ({ id, x: s.x / s.n, y: s.y / s.n, n: s.n }));
  // Real players are tracked for most of the match; ghosts (spectators,
  // reflections) only briefly. Keep the two best-supported tracks per side.
  const bySupport = (a: { n: number }, b: { n: number }) => b.n - a.n;
  const nearAll = means.filter((m) => m.y > NET_Y).sort(bySupport);
  const farAll = means.filter((m) => m.y <= NET_Y).sort(bySupport);
  const near = nearAll.slice(0, 2).sort((a, b) => a.x - b.x);
  const far = farAll.slice(0, 2).sort((a, b) => a.x - b.x);

  const mapping = new Map<number, number>();
  const place = (group: typeof means, base: number) => {
    if (group.length === 1) {
      mapping.set(group[0].id, base + (group[0].x < COURT_WIDTH / 2 ? 0 : 1));
    } else {
      group.forEach((m, i) => mapping.set(m.id, base + Math.min(i, 1)));
    }
  };
  place(near, 0);
  place(far, 2);
  // A side with only one real player leaves a free id; the best-supported
  // leftover track (e.g. a player who crossed the net line) can take it.
  const free = [0, 1, 2, 3].filter((id) => ![...mapping.values()].includes(id));
  for (const m of [...nearAll.slice(2), ...farAll.slice(2)].sort(bySupport)) {
    const id = free.shift();
    if (id !== undefined) mapping.set(m.id, id);
  }
  return mapping;
}

export function playerIdentity(id: number): PlayerIdentity {
  const team = id < 2 ? "A" : "B";
  const side = id % 2 === 0 ? "left" : "right";
  const end = id < 2 ? "near" : "far";
  return { team, label: `${team}${(id % 2) + 1} · ${end} ${side}` };
}

export const PLAYER_COLORS = ["#22d3ee", "#a78bfa", "#fb923c", "#f472b6"];
