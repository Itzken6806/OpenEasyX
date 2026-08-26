import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

const context = (fetchImpl: typeof fetch): PluginContext => ({ config: {}, fetch: fetchImpl, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log: () => undefined });

describe("Wikidata plugin", () => {
  it("keeps adult human matches and enriches profiles without a key", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "wbsearchentities") return Response.json({ search: [
        { id: "Q1", label: "Example Star", description: "adult film performer" },
        { id: "Q2", label: "Example Star Album", description: "music album" },
      ] });
      return Response.json({ entities: {
        Q1: { id: "Q1", aliases: { en: [{ value: "Example" }] }, claims: {
          P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
          P106: [{ mainsnak: { datavalue: { value: { id: "Q488111" } } } }],
          P18: [{ mainsnak: { datavalue: { value: "Example.jpg" } } }],
          P2003: [{ mainsnak: { datavalue: { value: "example" } } }],
        } },
        Q2: { id: "Q2", claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q482994" } } } }] } },
      } });
    }) as typeof fetch;

    const results = await plugin.searchPeople!(context(fetchMock), "Example Star");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ externalId: "Q1", name: "Example Star", aliases: ["Example"] });
    expect(results[0].profileUrls).toContain("https://www.instagram.com/example/");
    expect(results[0].imageUrl).toContain("Special:FilePath/Example.jpg");
  });
});
