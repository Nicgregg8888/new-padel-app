/**
 * Ball-hit "pops" from the soundtrack. A padel ball struck by a racket makes a
 * short, sharp, high-frequency click that stands out from crowd noise and
 * commentary, so a simple transient detector finds most hits with timing far
 * more precise than a video frame.
 */

export interface AudioHits {
  times: number[];
  /** False when the pattern doesn't look like padel (music beats, silence, noise). */
  usable: boolean;
}

const HOP_S = 0.01;
const MEDIAN_WINDOW = 51; // hops, ~0.5 s of context
const RATIO = 3;
const MERGE_S = 0.15;
const MAX_AUDIO_FILE_BYTES = 600 * 1024 * 1024;

/** Onset times (seconds) of sharp transients in mono PCM. */
export function detectPops(samples: Float32Array, sampleRate: number): number[] {
  const hop = Math.max(1, Math.round(sampleRate * HOP_S));
  const n = Math.floor((samples.length - 2) / hop);
  if (n < 3) return [];
  // Second difference: a cheap high-pass that emphasises clicks over speech and hum.
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * hop;
    for (let k = start; k < start + hop; k++) {
      const d = samples[k + 2] - 2 * samples[k + 1] + samples[k];
      sum += d * d;
    }
    env[i] = Math.sqrt(sum / hop);
  }
  // Compare each hop with the running median of its surroundings.
  const half = (MEDIAN_WINDOW - 1) / 2;
  const ratio = new Float32Array(n);
  const window: number[] = [];
  for (let i = 0; i < n; i++) {
    window.length = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) window.push(env[j]);
    window.sort((a, b) => a - b);
    const med = window[window.length >> 1];
    ratio[i] = env[i] / (med + 1e-6);
  }
  const peaks: { t: number; r: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (ratio[i] < RATIO || ratio[i] < ratio[i - 1] || ratio[i] < ratio[i + 1]) continue;
    const t = i * HOP_S;
    const last = peaks[peaks.length - 1];
    if (last && t - last.t < MERGE_S) {
      if (ratio[i] > last.r) peaks[peaks.length - 1] = { t, r: ratio[i] };
    } else {
      peaks.push({ t, r: ratio[i] });
    }
  }
  return peaks.map((p) => p.t);
}

/**
 * Decide whether the pops look like a padel match: a plausible rate, and not
 * the metronome-regular spacing of a music track.
 */
export function assessPops(times: number[], seconds: number): AudioHits {
  const rate = times.length / Math.max(seconds, 1);
  if (times.length < 4 || rate < 0.15 || rate > 3) return { times, usable: false };
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  const regular = sd / mean < 0.15; // beats; real rallies are irregular
  return { times, usable: !regular };
}

/** Decode a video file's soundtrack in the browser and find the pops. */
export async function audioHitsFromFile(src: string, range?: { start: number; end: number }): Promise<AudioHits> {
  const empty = { times: [], usable: false };
  try {
    const res = await fetch(src);
    // Decoding needs the whole file in memory; skip it for very large files.
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > MAX_AUDIO_FILE_BYTES) return empty;
    const buf = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 22050);
    const audio = await ctx.decodeAudioData(buf);
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / audio.numberOfChannels;
    }
    let times = detectPops(mono, audio.sampleRate);
    if (range) times = times.filter((t) => t >= range.start && t <= range.end);
    const seconds = range ? range.end - range.start : audio.duration;
    return assessPops(times, seconds);
  } catch {
    // No audio track, or a codec this browser can't decode.
    return empty;
  }
}
