import { describe, expect, it } from "vitest";
import {
  noteRenderedVideoFrame, noteVideoStallRecovery, shouldRecoverVideoStall,
  VIDEO_STALL_MAX_RECOVERIES, videoStallState,
} from "./video-stall-recovery";

const playing = {
  now: 5_000, currentTime: 8, duration: 120, paused: false, ended: false,
  seeking: false, readyState: 4, hidden: false,
};

describe("video stall recovery", () => {
  it("detects audio time advancing while rendered video frames remain frozen", () => {
    const state = videoStallState(0, 2);
    expect(shouldRecoverVideoStall(state, playing)).toBe(true);
  });

  it("does not interfere with normal buffering, seeking, pausing, or hidden tabs", () => {
    const state = videoStallState(0, 2);
    expect(shouldRecoverVideoStall(state, { ...playing, readyState: 2 })).toBe(false);
    expect(shouldRecoverVideoStall(state, { ...playing, seeking: true })).toBe(false);
    expect(shouldRecoverVideoStall(state, { ...playing, paused: true })).toBe(false);
    expect(shouldRecoverVideoStall(state, { ...playing, hidden: true })).toBe(false);
  });

  it("uses a cooldown, limits repeated retries, and resets after a rendered frame", () => {
    const state = videoStallState(0, 2);
    noteVideoStallRecovery(state, 5_000, 8);
    expect(shouldRecoverVideoStall(state, { ...playing, now: 9_500, currentTime: 12 })).toBe(false);
    for (let retry = 1; retry < VIDEO_STALL_MAX_RECOVERIES; retry += 1) noteVideoStallRecovery(state, 20_000 + retry * 11_000, 12 + retry * 2);
    expect(shouldRecoverVideoStall(state, { ...playing, now: 60_000, currentTime: 30 })).toBe(false);
    noteRenderedVideoFrame(state, 61_000, 30);
    expect(state.consecutiveRecoveries).toBe(0);
  });
});
