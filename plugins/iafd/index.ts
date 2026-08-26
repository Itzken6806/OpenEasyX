import { definePlugin, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";
import { absoluteUrl, browserHtml, plainHtml } from "../browser-html-utils.js";

const BASE = "https://www.iafd.com";

export function parseIafdResults(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const results: Array<{ id: string; name: string; imageUrl?: string; aliases: string[]; url: string }> = [];
  for (const [, row] of rows) {
    const link = row.match(/<a[^>]+href=["'](\/person\.rme\/(?:id|perfid)=[^"']+)["'][^>]*>/i)?.[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (!link || cells.length < 2) continue;
    const name = plainHtml(cells[1]);
    if (!name) continue;
    const image = cells[0].match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
    const aliases = plainHtml(cells[2] ?? "").split(/\s*,\s*/).filter(Boolean);
    const url = absoluteUrl(link, BASE);
    const id = link.split("=").at(-1)!;
    if (!results.some((item) => item.id === id)) results.push({ id, name, imageUrl: image ? absoluteUrl(image, BASE) : undefined, aliases, url });
  }
  return results;
}

function profileLinks(html: string, profileUrl: string): string[] {
  const bodyStart = html.indexOf('<div id="headshot">');
  const body = bodyStart >= 0 ? html.slice(bodyStart, html.indexOf("</footer>", bodyStart)) : html;
  const links = [...body.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]);
  return [...new Set([profileUrl, ...links.filter((url) => !/iafd\.com\/(?:calendar|astrology)/i.test(url))])];
}

export default definePlugin({
  manifest: {
    id: "org.easyx.iafd", name: "IAFD", version: "1.0.0", author: "Open EasyX", homepage: BASE,
    description: "Search the Internet Adult Film Database and import performer headshots, aliases, and public profile links. No API key required.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const html = await browserHtml(context, `${BASE}/results.asp?searchtype=comprehensive&searchstring=test`);
    if (!/id=["']tbl(?:Fem|Mal)["']/i.test(html)) throw new Error("IAFD did not return its performer results table");
    return { ok: true, message: "IAFD performer search is reachable through EasyX's browser-compatible transport. No API key is required." };
  },
  async searchPeople(context, query) {
    const url = `${BASE}/results.asp?searchtype=comprehensive&searchstring=${encodeURIComponent(query)}`;
    return parseIafdResults(await browserHtml(context, url)).slice(0, 8).map((result) => ({
      externalId: result.id, name: result.name, aliases: result.aliases, imageUrl: result.imageUrl, profileUrls: [result.url], metadata: { origin: "iafd", transport: "browser-tls" },
    }));
  },
  async discoverSources(context, performer): Promise<SourceCandidate[]> {
    const id = performer.externalRefs["org.easyx.iafd"];
    if (!id) return [];
    const url = `${BASE}/person.rme/id=${encodeURIComponent(id)}`;
    return profileLinks(await browserHtml(context, url), url).map((profileUrl) => ({ externalId: profileUrl, label: domainFromUrl(profileUrl), profileUrl, domain: domainFromUrl(profileUrl) }));
  },
});
