import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

describe("Web Media plugin", () => {
  it("lists and resolves direct media from a public page", async () => {
    const fetchMock = vi.fn(async () => new Response('<meta property="og:video" content="https://cdn.example/clip.mp4"><img src="/photo.jpg">', { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const context: PluginContext = { config: {}, fetch: fetchMock, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined };
    const items = await plugin.listMedia!(context, { id: "s", externalId: "s", performerId: "p", profileUrl: "https://example.test/profile", domain: "example.test" });
    expect(items).toHaveLength(2);
    expect(await plugin.resolveDownload!(context, items[0])).toMatchObject({ url: expect.stringMatching(/^https:\/\//) });
  });

  it("uses the source Last-Modified date for a direct media URL", async () => {
    const fetchMock = vi.fn(async () => new Response("image", { status: 200, headers: {
      "content-type": "image/jpeg", "content-length": "5", "last-modified": "Sat, 03 Feb 2024 10:20:30 GMT",
    } })) as typeof fetch;
    const context: PluginContext = { config: {}, fetch: fetchMock, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined };
    const items = await plugin.listMedia!(context, { id: "s", externalId: "s", performerId: "p", profileUrl: "https://cdn.example/photo.jpg", domain: "cdn.example" });
    expect(items).toMatchObject([{ mediaType: "image", expectedBytes: 5, publishedAt: "2024-02-03T10:20:30.000Z" }]);
  });
});
