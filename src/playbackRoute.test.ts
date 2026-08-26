import { describe, expect, it } from "vitest";
import { playbackAutoStart, playbackLocationState } from "./playbackRoute";

describe("playback route state", () => {
  it("does not autoplay a media opened manually", () => {
    const state = playbackLocationState("/library?page=2", { query: "kind=video" });
    expect(playbackAutoStart(state)).toBe(false);
  });

  it("keeps autoplay enabled while routing to the next media", () => {
    const state = playbackLocationState("/library?page=2", { query: "kind=video" }, true);
    expect(playbackAutoStart(state)).toBe(true);
    expect(state.easyx?.context).toEqual({ query: "kind=video" });
  });
});
