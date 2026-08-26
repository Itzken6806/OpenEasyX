import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

function context(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}): PluginContext {
  return { config: { url: "http://stash:9999", apiKey: "secret", ...extra }, fetch: fetchImpl, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined };
}

describe("Stash plugin", () => {
  it("searches performers through GraphQL and resolves relative images", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).ApiKey).toBe("secret");
      expect(JSON.parse(String(init?.body)).variables.filter.q).toBe("Example");
      return new Response(JSON.stringify({ data: { findPerformers: { performers: [{ id: "42", name: "Example", alias_list: ["Alias"], image_path: "/performer/42/image", urls: ["https://example.test/profile"] }] } } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const results = await plugin.searchPeople!(context(fetchMock), "Example");
    expect(results[0]).toMatchObject({ externalId: "42", name: "Example", imageUrl: "http://stash:9999/performer/42/image" });
  });

  it("asks Stash to scan the path visible inside its container", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variables.input.paths).toEqual(["/stash-media/Person/example.test/file.mp4"]);
      return new Response(JSON.stringify({ data: { metadataScan: "job-id" } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await plugin.afterDownload!(context(fetchMock, { scanPath: "/stash-media", scanAfterDownload: true }), { absolutePath: "/media/Person/example.test/file.mp4", relativePath: "Person/example.test/file.mp4", mediaType: "video", checksumSha256: "hash" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
