import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";
import plugin, { parseXVideosListing } from "./index.js";

function jsonResponse(payload: unknown, url = "https://www.xvideos.com/channels/example/videos/new/0") {
  const response = new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("XVideos plugin", () => {
  it("extracts one public video and resolves it through yt-dlp", async () => {
    const runCommand = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ id: "abc123", title: "Public video", webpage_url: "https://www.xvideos.com/videoabc123/public_video", upload_date: "20240203", width: 1920, height: 1080 }),
      stderr: "",
    }));
    const context: PluginContext = { config: {}, fetch, runCommand, log: () => undefined };
    const source = { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.xvideos.com/videoabc123/public_video", domain: "xvideos.com" };

    const items = await plugin.listMedia!(context, source);

    expect(runCommand).toHaveBeenCalledWith("yt-dlp", expect.arrayContaining(["--dump-single-json", "--referer", "https://www.xvideos.com/", source.profileUrl]), expect.any(Object));
    expect(items).toMatchObject([{ externalId: "xvideos:abc123", mediaType: "video", filename: "abc123.mp4", publishedAt: "2024-02-03T00:00:00.000Z" }]);
    expect(await plugin.resolveDownload!(context, items[0])).toMatchObject({ kind: "command", command: "yt-dlp", filename: "abc123.mp4" });
  });

  it("parses profile listing metadata into downloadable canonical video URLs", () => {
    expect(parseXVideosListing({ videos: [
      { id: 40513949, eid: "ipakhvdab2e", u: "/prof-video-click/upload/example/ipakhvdab2e/a_video", tf: "A &amp; B", il: "https://cdn.example/thumb.jpg", ut: 1_708_473_600 },
    ] }, "https://www.xvideos.com/channels/example")).toMatchObject([{
      externalId: "xvideos:ipakhvdab2e",
      identityKey: "xvideos:ipakhvdab2e",
      title: "A & B",
      pageUrl: "https://www.xvideos.com/video.ipakhvdab2e/a_video",
      filename: "ipakhvdab2e.mp4",
      publishedAt: "2024-02-21T00:00:00.000Z",
      metadata: { thumbnailUrl: "https://cdn.example/thumb.jpg" },
    }]);
  });

  it("lists the newest videos from profile pages and follows their canonical redirect", async () => {
    const profileResponse = new Response("<title>Example - XVIDEOS.COM</title>");
    Object.defineProperty(profileResponse, "url", { value: "https://www.xvideos.com/channels/example" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(profileResponse)
      .mockResolvedValueOnce(jsonResponse({
        nb_videos: 2, nb_per_page: 36, current_page: 0,
        videos: [
          { eid: "newest1", u: "/prof-video-click/upload/example/newest1/first", t: "First" },
          { eid: "newest2", u: "/prof-video-click/upload/example/newest2/second", t: "Second" },
        ],
      }));
    const context: PluginContext = {
      config: { maxItems: 100 }, fetch: fetchMock as typeof fetch,
      runCommand: vi.fn(), log: () => undefined,
    };
    const source = { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.xvideos.com/profiles/example", domain: "xvideos.com" };

    const items = await plugin.listMedia!(context, source);

    expect(fetchMock).toHaveBeenNthCalledWith(2, new URL("https://www.xvideos.com/channels/example/videos/new/0"), expect.objectContaining({ method: "POST" }));
    expect(items).toMatchObject([
      { externalId: "xvideos:newest1", pageUrl: "https://www.xvideos.com/video.newest1/first" },
      { externalId: "xvideos:newest2", pageUrl: "https://www.xvideos.com/video.newest2/second" },
    ]);
  });

  it("paginates profile listings up to the configured maximum", async () => {
    const profileResponse = new Response("<title>Example - XVIDEOS.COM</title>");
    Object.defineProperty(profileResponse, "url", { value: "https://www.xvideos.com/channels/example" });
    const videos = (offset: number) => Array.from({ length: 36 }, (_, index) => ({ eid: `id${offset + index}`, u: `/prof-video-click/upload/example/id${offset + index}/video` }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(profileResponse)
      .mockResolvedValueOnce(jsonResponse({ nb_videos: 90, nb_per_page: 36, videos: videos(0) }))
      .mockResolvedValueOnce(jsonResponse({ nb_videos: 90, nb_per_page: 36, videos: videos(36) }, "https://www.xvideos.com/channels/example/videos/new/1"));
    const context: PluginContext = { config: { maxItems: 50 }, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: () => undefined };

    const items = await plugin.listMedia!(context, { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.xvideos.com/channels/example", domain: "xvideos.com" });

    expect(items).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(items.at(-1)?.externalId).toBe("xvideos:id49");
  });

  it("advertises individual videos plus profile and channel URLs", () => {
    expect(plugin.manifest.sourceUrlPatterns).toContain("https://*.xvideos.com/video*");
    expect(plugin.manifest.sourceUrlPatterns).toContain("https://www.xvideos.com/embedframe/*");
    expect(plugin.manifest.sourceUrlPatterns).toContain("https://*.xvideos.com/profiles/*");
    expect(plugin.manifest.sourceUrlPatterns).toContain("https://*.xvideos.com/channels/*");
    expect(plugin.manifest.sourceUrlPatterns).toContain("https://*.xvideos.com/pornstars/*");
  });
});
