import { describe, expect, it } from "vitest";
import { assessPops, detectPops } from "../src/analysis/audio";

function crowd(seconds: number, sr: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const x = new Float32Array(seconds * sr);
  // Low rumble plus a little hiss: crowd and commentary.
  for (let i = 0; i < x.length; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 180 * i) / sr) + 0.02 * rnd();
  return x;
}

function addPop(x: Float32Array, sr: number, t: number) {
  const i0 = Math.round(t * sr);
  for (let k = 0; k < 60; k++) x[i0 + k] += 0.6 * Math.exp(-k / 12) * (k % 2 ? 1 : -1);
}

describe("detectPops", () => {
  const sr = 22050;
  const hits = [0.8, 2.1, 3.0, 4.7, 5.5, 7.2];
  const x = crowd(8, sr);
  hits.forEach((t) => addPop(x, sr, t));

  it("finds racket pops in crowd noise to within a couple of audio frames", () => {
    const got = detectPops(x, sr);
    expect(got).toHaveLength(hits.length);
    got.forEach((t, i) => expect(Math.abs(t - hits[i])).toBeLessThan(0.025));
  });

  it("finds nothing in plain crowd noise", () => {
    expect(detectPops(crowd(5, sr, 7), sr)).toHaveLength(0);
  });
});

describe("assessPops", () => {
  it("accepts an irregular rally rhythm", () => {
    expect(assessPops([0.8, 2.1, 3.0, 4.7, 5.5, 7.2], 8).usable).toBe(true);
  });
  it("rejects a music beat and implausible rates", () => {
    expect(assessPops([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4).usable).toBe(false);
    expect(assessPops([1, 2], 10).usable).toBe(false);
  });
});
