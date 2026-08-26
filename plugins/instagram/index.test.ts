import { describe, expect, it } from "vitest";
import plugin, { extractInstagramEmbed, instagramPostUrls } from "./index.js";

describe("public Instagram plugin", () => {
  it("discovers unique public posts and reels from profile HTML", () => {
    expect(instagramPostUrls('<a href="/p/ABC_1/"></a><a href="/reel/XYZ-2/"></a><a href="/p/ABC_1/"></a>')).toEqual([
      "https://www.instagram.com/p/ABC_1/",
      "https://www.instagram.com/reel/XYZ-2/",
    ]);
  });

  it("extracts a public embed image with a stable post identity", () => {
    const items = extractInstagramEmbed('<img class="EmbeddedMediaImage" alt="Public photo" src="https://scontent.example/media.jpg">', "https://www.instagram.com/p/ABC_1/");
    expect(items).toMatchObject([{ externalId: "instagram:ABC_1:image:1", title: "Public photo", mediaType: "image", filename: "ABC_1-1.jpg" }]);
  });

  it("extracts escaped reel URLs without also treating the cover as a photo", () => {
    const html = String.raw`<img class="EmbeddedMediaImage" src="https://scontent.example/cover.jpg"><script>{\"display_url\":\"https:\\\/\\\/scontent.example\\\/cover.jpg\",\"video_url\":\"https:\\\/\\\/scontent.example\\\/clip.mp4?x=1\\u0026y=2\"}</script>`;
    const items = extractInstagramEmbed(html, "https://www.instagram.com/reel/XYZ-2/");
    expect(items).toMatchObject([{ externalId: "instagram:XYZ-2:video:1", mediaType: "video", filename: "XYZ-2-1.mp4" }]);
    expect(items[0].metadata?.downloadUrl).toBe("https://scontent.example/clip.mp4?x=1&y=2");
  });

  it("requires no Instagram session", () => {
    expect(plugin.manifest.browserAuth).toBeUndefined();
    expect(plugin.manifest.settings?.some((field) => field.type === "session")).toBe(false);
  });
});
