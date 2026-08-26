import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../packages/plugin-sdk/index.js";
import { galleryArgs, galleryDownload, listGalleryMedia, normalizeProfileUrl } from "./gallery-dl-utils.js";

function context(output: unknown): PluginContext {
  return {
    config: { maxItems: 5 }, fetch, log: vi.fn(),
    runCommand: vi.fn(async () => ({ exitCode: 0, stdout: JSON.stringify(output), stderr: "" })),
  };
}

describe("gallery-dl utilities", () => {
  it("turns URL messages into stable Facebook candidates", async () => {
    const ctx = context([[2, {}], [3, "https://cdn.test/image.jpg", { id: "123", filename: "image", extension: "jpg", caption: "Photo", date: "2026-08-23 10:00:00", created_at: "2025-01-02T12:00:00Z" }]]);
    const items = await listGalleryMedia(ctx, "https://facebook.com/person/photos", "facebook");
    expect(items).toMatchObject([{ externalId: "facebook:123:image.jpg", title: "Photo", pageUrl: "https://www.facebook.com/photo/?fbid=123", mediaType: "image", filename: "image.jpg" }]);
    expect(items[0].publishedAt).toBe("2025-01-02T12:00:00.000Z");
  });

  it("builds authenticated download commands without persisting secrets in items", () => {
    const request = galleryDownload({ externalId: "x", mediaType: "image", pageUrl: "https://x.com/u/status/1", filename: "x.jpg", metadata: { galleryFilename: "x" } }, { cookiesFile: "/data/cookies/x.txt" }, "twitter");
    expect(request.args).toContain("/data/cookies/x.txt");
    expect(request.args).toContain("{outputDir}");
    expect(request.args).toContain("{outputName}");
    expect(request.args.join(" ")).toContain('filename == "x"');
  });

  it("maps platform authentication settings and profile endpoints", () => {
    expect(galleryArgs({ token: "secret" }, "fansly")).toContain("extractor.fansly.token=secret");
    expect(galleryArgs({ apiKey: "key" }, "tumblr")).not.toContain("extractor.tumblr.api-key=key");
    expect(galleryArgs({}, "tiktok")).toContain("extractor.tiktok.browser=chrome");
    expect(normalizeProfileUrl("https://x.com/example", "twitter")).toBe("https://x.com/example/media");
    expect(normalizeProfileUrl("https://www.instagram.com/example/", "instagram")).toBe("https://www.instagram.com/example/posts");
    expect(normalizeProfileUrl("https://www.patreon.com/example", "patreon")).toBe("https://www.patreon.com/c/example");
  });

  it("turns gallery-dl JSON error messages into source failures", async () => {
    const ctx = context([[-1, { error: "AuthRequired", message: "public timeline unavailable" }]]);
    await expect(listGalleryMedia(ctx, "https://x.com/example/media", "twitter")).rejects.toThrow("public timeline unavailable");
  });
});
