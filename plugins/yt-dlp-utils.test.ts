import { describe, expect, it } from "vitest";
import { liveStreamFromInfo } from "./yt-dlp-utils.js";

describe("live stream selection", () => {
  it("keeps separate live video and audio tracks when yt-dlp selected both formats", () => {
    const master = "https://cdn.test/master.m3u8?token=fresh";
    expect(liveStreamFromInfo({
      requested_formats: [
        { url: "https://cdn.test/video.m3u8", manifest_url: master, vcodec: "avc1", acodec: "none", height: 1080 },
        { url: "https://cdn.test/audio.m3u8", manifest_url: master, vcodec: "none", acodec: "aac" },
      ],
      formats: [{ url: "https://cdn.test/audio-low.m3u8", vcodec: "none", acodec: "aac" }],
      http_headers: { Referer: "https://live.test/" },
    }, "alice")).toEqual({
      url: "https://cdn.test/video.m3u8", audioUrl: "https://cdn.test/audio.m3u8",
      headers: { Referer: "https://live.test/" }, contentType: "application/vnd.apple.mpegurl",
    });
  });

  it("keeps the best muxed stream when no master manifest exists", () => {
    expect(liveStreamFromInfo({ formats: [
      { url: "https://cdn.test/360.mp4", vcodec: "h264", acodec: "aac", height: 360 },
      { url: "https://cdn.test/720.mp4", vcodec: "h264", acodec: "aac", height: 720 },
    ] }, "alice")).toEqual({ url: "https://cdn.test/720.mp4", headers: undefined, contentType: undefined });
  });
});
