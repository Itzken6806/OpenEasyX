import { definePlugin, type PersonCandidate, type PluginContext, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";
import { absoluteUrl, browserHtml, plainHtml } from "../browser-html-utils.js";

const BASE = "https://www.babepedia.com";

type SearchHit = { label?: string; value?: string; type?: string };

function profileUrl(name: string): string {
  return `${BASE}/babe/${encodeURIComponent(name.replaceAll(" ", "_"))}`;
}

function profileDetails(html: string, url: string) {
  const name = plainHtml(html.match(/<h1[^>]+id=["']babename["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const aliasBlock = html.match(/<div[^>]+id=["']aliasinfo["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? "";
  const aliases = [...aliasBlock.matchAll(/<span[^>]+class=["']aliasname["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => plainHtml(match[1])).filter(Boolean);
  const profileImage = html.match(/<div[^>]+id=["']profimg["'][^>]*>[\s\S]{0,1800}?<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const socialBlock = html.match(/<div[^>]+id=["']socialicons["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const links = [...socialBlock.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((match) => absoluteUrl(match[1], BASE)).map((link) => link.replace(`${BASE}/onlyfans/`, "https://onlyfans.com/"));
  return { name, aliases, imageUrl: profileImage ? absoluteUrl(profileImage, BASE) : undefined, profileUrls: [...new Set([url, ...links])] };
}

async function loadCandidate(context: PluginContext, hit: SearchHit): Promise<PersonCandidate | undefined> {
  if (!hit.value || hit.type === "search") return undefined;
  const url = profileUrl(hit.value);
  const labelAlias = hit.label && hit.label !== hit.value ? hit.label.replace(new RegExp(`\\s*\\(${hit.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`, "i"), "").trim() : "";
  let details: ReturnType<typeof profileDetails>;
  try {
    details = profileDetails(await browserHtml(context, url), url);
  } catch {
    details = { name: hit.value, aliases: [], imageUrl: undefined, profileUrls: [url] };
  }
  return {
    externalId: hit.value,
    name: details.name || hit.value,
    aliases: [...new Set([...details.aliases, ...(labelAlias ? [labelAlias] : [])])],
    imageUrl: details.imageUrl,
    profileUrls: details.profileUrls,
    metadata: { origin: "babepedia", transport: "browser-tls" },
  };
}

export default definePlugin({
  manifest: {
    id: "org.easyx.babepedia", name: "Babepedia", version: "1.0.0", author: "Open EasyX", homepage: BASE,
    description: "Search Babepedia performer profiles and import aliases plus public social links. No API key required.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const raw = await browserHtml(context, `${BASE}/ajax-search.php?term=${encodeURIComponent("test")}`);
    JSON.parse(raw);
    return { ok: true, message: "Babepedia search is reachable through EasyX's browser-compatible transport. No API key is required." };
  },
  async searchPeople(context, query) {
    const raw = await browserHtml(context, `${BASE}/ajax-search.php?term=${encodeURIComponent(query.replaceAll("-", " "))}`);
    const hits = JSON.parse(raw) as SearchHit[];
    return (await Promise.all(hits.filter((hit) => hit.value && hit.type !== "search").slice(0, 6).map((hit) => loadCandidate(context, hit)))).filter((candidate): candidate is PersonCandidate => Boolean(candidate));
  },
  async discoverSources(context, performer): Promise<SourceCandidate[]> {
    const externalId = performer.externalRefs["org.easyx.babepedia"];
    if (!externalId) return [];
    const url = profileUrl(externalId);
    return profileDetails(await browserHtml(context, url), url).profileUrls.map((profileUrl) => ({ externalId: profileUrl, label: domainFromUrl(profileUrl), profileUrl, domain: domainFromUrl(profileUrl) }));
  },
});
