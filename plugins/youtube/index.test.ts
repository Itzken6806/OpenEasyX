import { describe, expect, it } from "vitest";
import { youtubeListingUrl } from "./index.js";
import { configuredArgs, playlistCandidates, ytDlpDownload } from "../yt-dlp-utils.js";

describe("YouTube plugin", () => {
  it("targets the videos tab for channel and handle URLs", () => {
    expect(youtubeListingUrl("https://www.youtube.com/@example")).toBe("https://www.youtube.com/@example/videos");
    expect(youtubeListingUrl("https://www.youtube.com/channel/abc/videos")).toBe("https://www.youtube.com/channel/abc/videos");
    expect(youtubeListingUrl("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("keeps the oldest reliable publication date exposed by yt-dlp", () => {
    const items = playlistCandidates({ entries: [{ id: "abc", webpage_url: "https://youtube.com/watch?v=abc", timestamp: 1_640_995_200, upload_date: "20200102" }] }, "https://youtube.com/@example", "youtube", 10);
    expect(items[0].publishedAt).toBe("2020-01-02T00:00:00.000Z");
  });

  it("keeps extractor internals out of user configuration", () => {
    expect(configuredArgs({ cookiesFile: "/data/session.txt", impersonate: "firefox" })).toEqual(["--cookies", "/data/session.txt"]);
    const request = ytDlpDownload({ externalId: "abc", pageUrl: "https://youtube.com/watch?v=abc", mediaType: "video" }, { format: "worst" });
    expect(request.args).not.toContain("worst");
    expect(request.args).toContain("--progress");
    expect(request.args).not.toContain("--no-progress");
    expect(request.args[request.args.indexOf("--progress-template") + 1]).toContain("easyx-progress:");
    expect(request.args).toContain("bestvideo*[vcodec!=none]+bestaudio[acodec!=none]/best[acodec!=none]/best");
  });
});
