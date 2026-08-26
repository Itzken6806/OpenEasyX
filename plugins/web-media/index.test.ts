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
});
