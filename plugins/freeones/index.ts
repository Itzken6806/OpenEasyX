import { definePlugin, type PluginContext, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";

const BASE = "https://www.freeones.com";

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    }
    return named[entity.toLowerCase()] ?? _match;
  });
}

function parseResults(html: string) {
  const results: Array<{ slug: string; name: string; imageUrl?: string }> = [];
  const cards = /<a\s+class="\s*teaser__link"[^>]*href="\/([^"/?#]+)\/feed"[\s\S]{0,5000}?<img[\s\S]{0,1200}?src="([^"]+)"[\s\S]{0,800}?alt="([^"]*)"[\s\S]{0,2600}?data-test="subject-name"[^>]*title="\s*([^"]+?)"/gi;
  for (const match of html.matchAll(cards)) {
    const slug = decodeHtml(match[1]);
    const name = decodeHtml(match[4] || match[3]).trim();
    if (!slug || !name || results.some((result) => result.slug === slug)) continue;
    results.push({ slug, name, imageUrl: new URL(decodeHtml(match[2]), BASE).toString() });
  }
  return results;
}

async function getHtml(context: PluginContext, url: URL): Promise<string> {
  const response = await context.fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.8",
      "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)",
    },
    signal: context.signal,
  });
  if (!response.ok) throw new Error(`FreeOnes returned HTTP ${response.status}`);
  const html = await response.text();
  if (/captcha|cf-chl-|just a moment/i.test(html)) throw new Error("FreeOnes presented an anti-bot challenge. Try again later or disable this plugin.");
  return html;
}

function profileUrl(slug: string): string {
  return `${BASE}/${encodeURIComponent(slug)}/bio`;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.freeones",
    name: "FreeOnes",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: BASE,
    description: "Search public FreeOnes performer pages without credentials. This is an HTML scraper because FreeOnes does not publish a public API.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const url = new URL("/performers", BASE);
    url.searchParams.set("q", "test");
    await getHtml(context, url);
    return { ok: true, message: "FreeOnes is reachable. This plugin uses public HTML and may stop working if the site changes or blocks your server." };
  },
  async searchPeople(context, query) {
    const url = new URL("/performers", BASE);
    url.searchParams.set("q", query);
    return parseResults(await getHtml(context, url)).slice(0, 8).map((result) => ({
      externalId: result.slug,
      name: result.name,
      imageUrl: result.imageUrl,
      profileUrls: [profileUrl(result.slug)],
      metadata: { origin: "freeones", transport: "public-html" },
    }));
  },
  async discoverSources(_context, performer): Promise<SourceCandidate[]> {
    const slug = performer.externalRefs["org.easyx.freeones"];
    if (!slug) return [];
    const urls = [profileUrl(slug), `${BASE}/${encodeURIComponent(slug)}/links`, `${BASE}/${encodeURIComponent(slug)}/photos`, `${BASE}/${encodeURIComponent(slug)}/videos`];
    return urls.map((url) => ({ externalId: url, label: new URL(url).pathname.split("/").at(-1) || "profile", profileUrl: url, domain: domainFromUrl(url) }));
  },
});
