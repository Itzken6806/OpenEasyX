import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

const context = (fetchImpl: typeof fetch): PluginContext => ({ config: {}, fetch: fetchImpl, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined });

describe("FreeOnes plugin", () => {
  it("parses public performer cards and decodes HTML entities", async () => {
    const html = `<a class=" teaser__link" href="/example-star/feed">
      <img src="https://images.example/a.jpg?x=1&amp;y=2" alt="Example &amp; Star">
      <p data-test="subject-name" title=" Example &amp; Star">Example</p>
    </a>`;
    const fetchMock = vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const results = await plugin.searchPeople!(context(fetchMock), "Example Star");
    expect(results).toEqual([expect.objectContaining({
      externalId: "example-star", name: "Example & Star", imageUrl: "https://images.example/a.jpg?x=1&y=2",
      profileUrls: ["https://www.freeones.com/example-star/bio"],
    })]);
  });

  it("returns an operator-friendly error for an anti-bot challenge", async () => {
    const fetchMock = vi.fn(async () => new Response("<title>Just a moment...</title>")) as typeof fetch;
    await expect(plugin.searchPeople!(context(fetchMock), "Example")).rejects.toThrow("anti-bot challenge");
  });
});
