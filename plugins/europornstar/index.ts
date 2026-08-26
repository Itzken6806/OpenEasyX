import { definePlugin, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";
import { absoluteUrl, plainHtml } from "../browser-html-utils.js";

const BASE = "https://www.europornstar.com";

async function getHtml(context: Parameters<NonNullable<ReturnType<typeof definePlugin>["searchPeople"]>>[0], url: string): Promise<string> {
  const response = await context.fetch(url, { headers: { accept: "text/html", "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)" }, signal: context.signal });
  if (!response.ok) throw new Error(`EuroPornstar returned HTTP ${response.status}`);
  const html = await response.text();
  if (/cf-chl-|<title>just a moment/i.test(html)) throw new Error("EuroPornstar presented an anti-bot challenge");
  return html;
}

export function parseEuroPornstarResults(html: string) {
  const results: Array<{ id: string; name: string; imageUrl?: string; url: string }> = [];
  for (const match of html.matchAll(/<a\s+href=["']([^"']+)["'][^>]*>\s*<div\s+class=["']?thum["']?[^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*<br\s*\/?>\s*([^<]+)/gi)) {
    const url = absoluteUrl(match[1], BASE);
    const name = plainHtml(match[3]);
    if (!name || results.some((item) => item.url === url)) continue;
    results.push({ id: new URL(url).pathname, name, imageUrl: absoluteUrl(match[2], BASE), url });
  }
  return results;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.europornstar", name: "EuroPornstar", version: "1.0.0", author: "Open EasyX", homepage: BASE,
    description: "Search the public EuroPornstar model directory and import matching performer pages and preview images. No API key required.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const html = await getHtml(context, `${BASE}/search.php?q=test`);
    if (!/class=["']?list-pics/i.test(html)) throw new Error("EuroPornstar did not return its model search page");
    return { ok: true, message: "EuroPornstar's public model search is reachable. No API key is required." };
  },
  async searchPeople(context, query) {
    return parseEuroPornstarResults(await getHtml(context, `${BASE}/search.php?q=${encodeURIComponent(query)}`)).slice(0, 10).map((result) => ({
      externalId: result.id, name: result.name, imageUrl: result.imageUrl, profileUrls: [result.url], metadata: { origin: "europornstar", transport: "public-html" },
    }));
  },
  async discoverSources(_context, performer): Promise<SourceCandidate[]> {
    const id = performer.externalRefs["org.easyx.europornstar"];
    if (!id) return [];
    const profileUrl = absoluteUrl(id, BASE);
    return [{ externalId: profileUrl, label: "EuroPornstar profile", profileUrl, domain: domainFromUrl(profileUrl) }];
  },
});
