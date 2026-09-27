import { describe, expect, it } from "vitest";
import { limitClips, reelDuration } from "../src/lib/reelExport";

describe("highlight export limits", () => {
  const clips = Array.from({ length: 100 }, (_, i) => ({ start: i * 10, end: i * 10 + 3, label: `clip ${i}` }));
  it("keeps whole clips up to the time limit", () => {
    const out = limitClips(clips, 30);
    expect(out).toHaveLength(10);
    expect(reelDuration(out)).toBeCloseTo(30);
  });
  it("always keeps at least one clip", () => {
    expect(limitClips([{ start: 0, end: 500, label: "long rally" }], 30)).toHaveLength(1);
  });
});
