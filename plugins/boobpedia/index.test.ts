import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

const context = (fetchImpl: typeof fetch): PluginContext => ({ config: {}, fetch: fetchImpl, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined });

describe("Boobpedia plugin", () => {
  it("filters film pages and extracts performer profiles", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("list") === "search") return Response.json({ query: { search: [{ pageid: 1, title: "Example Star" }, { pageid: 2, title: "Example Star Movie" }] } });
      if (url.searchParams.get("prop") === "imageinfo") return Response.json({ query: { pages: [{ title: "File:Example.jpg", imageinfo: [{ thumburl: "https://images.example/Example.jpg" }] }] } });
      return Response.json({ query: { pages: [
        { pageid: 1, title: "Example Star", revisions: [{ slots: { main: { content: "{{Biobox new\n| name = Example Star\n| photo = [[File:Example.jpg|240px]]\n| alias = Example, Star E\n| instagram = example\n| homepage = https://example.test/\n}}" } } }] },
        { pageid: 2, title: "Example Star Movie", revisions: [{ slots: { main: { content: "{{film|Example Star Movie}}" } } }] },
      ] } });
    }) as typeof fetch;

    const results = await plugin.searchPeople!(context(fetchMock), "Example Star");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ externalId: "Example Star", name: "Example Star", aliases: ["Example", "Star E"], imageUrl: "https://images.example/Example.jpg" });
    expect(results[0].profileUrls).toContain("https://www.instagram.com/example/");
  });

  it("falls back to the page title after an empty name and supports Image photos", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("list") === "search") return Response.json({ query: { search: [{ pageid: 7, title: "Cherrycrush" }] } });
      if (url.searchParams.get("prop") === "imageinfo") return Response.json({ query: { pages: [{ title: "File:Cherrycrush.jpg", imageinfo: [{ thumburl: "https://images.example/cherry.jpg" }] }] } });
      return Response.json({ query: { pages: [{ pageid: 7, title: "Cherrycrush", revisions: [{ slots: { main: { content: "{{Biobox new\n| name =\n| photo = [[Image:Cherrycrush.jpg|240px|Cherrycrush]]\n| alias = Cherry Crush\n| twitter = first\n| twitter2 = second\n| youtube = @channel\n}}" } } }] }] } });
    }) as typeof fetch;
    const results = await plugin.searchPeople!(context(fetchMock), "Cherrycrush");
    expect(results[0]).toMatchObject({ name: "Cherrycrush", imageUrl: "https://images.example/cherry.jpg" });
    expect(results[0].profileUrls).toEqual(expect.arrayContaining([
      "https://x.com/first", "https://x.com/second", "https://www.youtube.com/@channel",
    ]));
  });
});
