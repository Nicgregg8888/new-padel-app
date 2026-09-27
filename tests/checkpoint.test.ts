import { describe, expect, it } from "vitest";
import { checkpointKey, packFrames, unpackFrames } from "../src/lib/checkpoint";
import type { CourtCorners, SampledFrame } from "../src/analysis/types";
import { makePose } from "./fixtures";

describe("checkpoint packing", () => {
  it("round-trips frames through typed arrays", () => {
    const frames: SampledFrame[] = [
      { t: 0.1, poses: [{ playerId: 0, landmarks: makePose({ x: 0.4, y: 0.6 }), court: { x: 3, y: 16 } }] },
      { t: 0.2, poses: [] },
      {
        t: 0.3,
        poses: [
          { playerId: 2, landmarks: makePose({ x: 0.5, y: 0.3 }), court: { x: 4, y: 5 } },
          { playerId: 3, landmarks: makePose({ x: 0.6, y: 0.3 }), court: { x: 7, y: 5 } },
        ],
      },
    ];
    const back = unpackFrames(packFrames("k", frames));
    expect(back).toHaveLength(3);
    expect(back[1].poses).toHaveLength(0);
    expect(back[2].poses[1].playerId).toBe(3);
    expect(back[2].poses[1].court.x).toBeCloseTo(7);
    expect(back[0].poses[0].landmarks[16].x).toBeCloseTo(frames[0].poses[0].landmarks[16].x, 5);
    expect(back[0].t).toBeCloseTo(0.1, 5);
  });

  it("keys on the file and the settings", () => {
    const fp = { name: "match.mp4", size: 1000, lastModified: 5 };
    const s = {
      corners: [
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.3 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ] as CourtCorners,
      sampleFps: 10,
      model: "full",
      minSwingSpeed: 9,
    };
    expect(checkpointKey(fp, s)).toBe(checkpointKey({ ...fp }, { ...s }));
    expect(checkpointKey(fp, s)).not.toBe(checkpointKey(fp, { ...s, sampleFps: 15 }));
    expect(checkpointKey(fp, s)).not.toBe(checkpointKey({ ...fp, size: 1001 }, s));
  });
});
