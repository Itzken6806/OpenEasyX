import { describe, expect, it } from "vitest";
import { autoplayOnOpen, initialAutoplay, nextMediaId, PHOTO_AUTOPLAY_SECONDS } from "./playback";

describe("mixed media autoplay", () => {
  it("opens a manually selected photo with autoplay disabled", () => {
    expect(initialAutoplay("image", false, "true")).toBe(false);
    expect(initialAutoplay("image", false, null)).toBe(false);
  });

  it("keeps autoplay while advancing from another media item", () => {
    expect(initialAutoplay("image", true, "true")).toBe(true);
    expect(initialAutoplay("video", true, "true")).toBe(true);
    expect(initialAutoplay("image", true, "false")).toBe(false);
  });

  it("preserves the existing preference for a manually opened video", () => {
    expect(initialAutoplay("video", false, null)).toBe(true);
    expect(initialAutoplay("video", false, "false")).toBe(false);
  });

  it("starts a newly opened video only while autoplay is enabled", () => {
    expect(autoplayOnOpen("video", null)).toBe(true);
    expect(autoplayOnOpen("video", "true")).toBe(true);
    expect(autoplayOnOpen("video", "false")).toBe(false);
    expect(autoplayOnOpen("image", "true")).toBe(false);
  });

  it("moves between photos and videos in playlist order", () => {
    expect(PHOTO_AUTOPLAY_SECONDS).toBe(10);
    expect(nextMediaId(["video-1", "photo-1", "video-2"], "video-1")).toBe("photo-1");
    expect(nextMediaId(["video-1", "photo-1", "video-2"], "photo-1")).toBe("video-2");
    expect(nextMediaId(["video-1", "photo-1", "video-2"], "video-2")).toBeUndefined();
  });
});
