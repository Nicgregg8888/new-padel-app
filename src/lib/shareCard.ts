import { COURT_LENGTH, COURT_WIDTH } from "../analysis/court";
import { PLAYER_COLORS } from "../analysis/tracker";
import type { ShotType } from "../analysis/types";
import { SHOT_COLORS, SHOT_LABELS, fmtTime, pct } from "./format";
import { playerName, type MatchRecord } from "./match";

const W = 1080;
const H = 1350;
const BG = "#0a0e14";
const PANEL = "#111823";
const TEXT = "#e6edf6";
const MUTED = "#8b9ab0";
const ACCENT = "#d4ff3a";
const FONT = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";
const PAIR = [
  ["togetherNet", "Together at net", "#199e70"],
  ["togetherMid", "Together mid", "#3987e5"],
  ["togetherBack", "Together back", "#c98500"],
  ["staggered", "Staggered", "#9085e9"],
  ["split", "Split", "#e66767"],
] as const;

/** A 1080×1350 summary image of the match, focused on the user's player. */
export async function renderShareCard(match: MatchRecord): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const { result } = match;
  const focusId = match.me ?? result.players.slice().sort((a, b) => b.totalShots - a.totalShots)[0]?.playerId ?? 0;
  const p = result.players.find((x) => x.playerId === focusId);
  const team = (result.teams ?? []).find((t) => t.team === (focusId < 2 ? "A" : "B"));
  const color = PLAYER_COLORS[focusId];

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const text = (s: string, x: number, y: number, size: number, fill = TEXT, weight = 600, align: CanvasTextAlign = "left") => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const panel = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 24);
    ctx.fill();
  };

  // Header
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(84, 92, 18, 0, Math.PI * 2);
  ctx.fill();
  text("Padel", 116, 104, 38, TEXT, 500);
  text("Vision", 116 + ctx.measureText("Padel").width + 4, 104, 38, ACCENT, 800);
  text(new Date(match.createdAt).toLocaleDateString(), W - 64, 104, 30, MUTED, 500, "right");
  const title = match.title.length > 40 ? `${match.title.slice(0, 39)}…` : match.title;
  text(title, 64, 180, 34, MUTED, 500);

  // Player headline
  text(playerName(match, focusId), 64, 270, 88, color, 800);
  text(
    `${fmtTime(result.duration)} of play · ${result.rallies.length} rallies · ${result.shots.length} shots detected`,
    64,
    324,
    30,
    MUTED,
    500,
  );

  // Big numbers
  if (p) {
    const stats: [string, string][] = [
      [`${Math.round(p.distanceMeters)} m`, "covered"],
      [`${(p.maxSpeed * 3.6).toFixed(1)}`, "km/h top speed"],
      [`${p.totalShots}`, "shots"],
      [pct(p.zoneShare.net), "time at the net"],
    ];
    stats.forEach(([v, l], i) => {
      const x = 64 + (i % 2) * 488;
      const y = 380 + Math.floor(i / 2) * 170;
      panel(x, y, 464, 150);
      text(v, x + 32, y + 88, 68, TEXT, 800);
      text(l, x + 32, y + 128, 28, MUTED, 500);
    });

    // Shot mix bar
    const types = (Object.keys(SHOT_LABELS) as ShotType[]).filter((t) => p.shots[t] > 0);
    text("Shot mix", 64, 764, 32, TEXT, 700);
    let x = 64;
    const barW = W - 128;
    for (const t of types) {
      const w = (p.shots[t] / Math.max(1, p.totalShots)) * barW;
      ctx.fillStyle = SHOT_COLORS[t];
      ctx.fillRect(x, 786, Math.max(0, w - 3), 40);
      x += w;
    }
    let lx = 64;
    ctx.font = `500 24px ${FONT}`;
    for (const t of types) {
      const label = `${SHOT_LABELS[t]} ${p.shots[t]}`;
      ctx.fillStyle = SHOT_COLORS[t];
      ctx.fillRect(lx, 846, 16, 16);
      text(label, lx + 24, 862, 24, MUTED, 500);
      lx += ctx.measureText(label).width + 56;
    }
  }

  // Pair play
  if (team) {
    text(`Pair play · Team ${team.team}`, 64, 940, 32, TEXT, 700);
    let x = 64;
    const barW = 600;
    for (const [key, , fill] of PAIR) {
      const w = team[key] * barW;
      if (w < 1) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x, 962, Math.max(0, w - 3), 40);
      if (team[key] >= 0.12) text(pct(team[key]), x + 10, 991, 22, BG, 800);
      x += w;
    }
    PAIR.forEach(([, label, fill], i) => {
      const y = 1040 + i * 36;
      ctx.fillStyle = fill;
      ctx.fillRect(64, y - 16, 16, 16);
      text(`${label}  ${pct(team[PAIR[i][0]])}`, 92, y, 24, MUTED, 500);
    });
  }

  // Court heatmap for the focus player
  if (p) {
    const ch = 290;
    const cw = ch * (COURT_WIDTH / COURT_LENGTH);
    const cx = W - 64 - cw;
    const cy = 930;
    ctx.fillStyle = "#1d4f7a";
    ctx.fillRect(cx, cy, cw, ch);
    const max = Math.max(...p.heatmap.flat(), 1e-9);
    for (let r = 0; r < COURT_LENGTH; r++) {
      for (let col = 0; col < COURT_WIDTH; col++) {
        const v = p.heatmap[r][col];
        if (!v) continue;
        ctx.globalAlpha = 0.2 + 0.75 * Math.sqrt(v / max);
        ctx.fillStyle = color;
        ctx.fillRect(cx + (col / COURT_WIDTH) * cw, cy + (r / COURT_LENGTH) * ch, cw / COURT_WIDTH, ch / COURT_LENGTH);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, cy + ch / 2);
    ctx.lineTo(cx + cw, cy + ch / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Coach headline
  if (match.report?.headline) {
    panel(64, 1230, W - 128, 84);
    const h = match.report.headline;
    text(`Coach: ${h.length > 70 ? `${h.slice(0, 69)}…` : h}`, 92, 1283, 28, ACCENT, 600);
  }

  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the card"))), "image/png"),
  );
}
