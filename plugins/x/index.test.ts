import { describe, expect, it } from "vitest";
import plugin, { parsePublicXRecords } from "./index.js";

describe("public X plugin", () => {
  it("maps helper output to stable direct media candidates", () => {
    const items = parsePublicXRecords(JSON.stringify([{
      id: "x:123:1", title: "Post", pageUrl: "https://x.com/user/status/123",
      url: "https://video.twimg.com/123.mp4", mediaType: "video", filename: "123-1.mp4",
      publishedAt: "2026-08-25T10:00:00Z", width: 1920, height: 1080,
    }]));
    expect(items).toMatchObject([{ externalId: "x:123:1", identityKey: "x:123:1", mediaType: "video", qualityScore: 2073600 }]);
  });

  it("requires neither account cookies nor developer credentials", () => {
    expect(plugin.manifest.browserAuth).toBeUndefined();
    expect(plugin.manifest.settings?.map((field) => field.key)).toEqual(["maxItems", "includeImages", "includeVideos"]);
  });
});
