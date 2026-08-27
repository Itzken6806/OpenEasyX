import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveCamRecordButton, LiveCamUnavailable, LivePlayer, liveCamListUrl, liveCamPresetFromSearch, liveCamUrl } from "./LiveCamPage";

describe("Live Cam availability", () => {
  it("explains that a live source plugin is needed instead of presenting a broken empty grid", () => {
    const html = renderToStaticMarkup(<LiveCamUnavailable reason="Live Cam works only with Open EasyX."/>);
    expect(html).toContain("No live-cam plugin is ready");
    expect(html).toContain("Plugins → Sources &amp; live");
  });

  it("uses the custom video controls for live streams", () => {
    const html = renderToStaticMarkup(<LivePlayer cam={{ id: "alice", username: "alice", pageUrl: "https://example.test/alice", providerId: "test", providerName: "Test Live" }} close={() => {}}/>);
    expect(html).toContain("custom-player live-custom-player");
    expect(html).toContain("ON AIR");
    expect(html).not.toContain("controls=\"\"");
    expect(html).not.toContain("Autoplay");
    expect(html).not.toContain("Subtitles");
  });

  it("creates shareable URLs for filters and individual live cams", () => {
    expect(liveCamListUrl({ query: "alice", providerId: "test.live", gender: "female", page: 3 }))
      .toBe("/live-cam?q=alice&source=test.live&gender=female&page=3");
    expect(liveCamPresetFromSearch("?q=alice&source=test.live&gender=female&page=3"))
      .toEqual({ query: "alice", providerId: "test.live", gender: "female", page: 3 });
    expect(liveCamUrl({ providerId: "test.live", id: "alice/bob" })).toBe("/live-cam/test.live/alice%2Fbob");
  });

  it("offers direct recording from a live room", () => {
    const html = renderToStaticMarkup(<LiveCamRecordButton cam={{ id: "alice", username: "alice", pageUrl: "https://live.test/alice", providerId: "test.live", providerName: "Test Live" }}/>);
    expect(html).toContain("Record live");
  });
});
