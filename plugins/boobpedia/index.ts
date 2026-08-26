import { definePlugin, type PersonCandidate, type PluginContext, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";

const API = "https://www.boobpedia.com/boobs/api.php";
const BASE = "https://www.boobpedia.com/boobs/";

type SearchResult = { pageid: number; title: string };
type WikiPage = {
  pageid: number;
  title: string;
  fullurl?: string;
  revisions?: Array<{ slots?: { main?: { content?: string } }; content?: string }>;
  imageinfo?: Array<{ url?: string; thumburl?: string }>;
};

function wikiUrl(title: string): string {
  return `${BASE}${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function content(page: WikiPage): string {
  return page.revisions?.[0]?.slots?.main?.content ?? page.revisions?.[0]?.content ?? "";
}

function field(wikitext: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = wikitext.match(new RegExp(`^\\|[ \\t]*${escaped}[ \\t]*=[ \\t]*([^\\r\\n]*)$`, "im"));
  return match?.[1]?.trim() || undefined;
}

function fields(wikitext: string, name: string): string[] {
  return [name, `${name}2`, `${name}3`, `${name}4`].map((fieldName) => field(wikitext, fieldName)).filter((value): value is string => Boolean(value));
}

function plain(value: string): string {
  return value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^/]*\/>/gi, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]+\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .trim();
}

function directUrl(value?: string): string | undefined {
  return value?.match(/https?:\/\/[^\s\]<>|}]+/i)?.[0];
}

function fileName(wikitext: string): string | undefined {
  return field(wikitext, "photo")?.match(/\[\[(?:File|Image):([^|\]]+)/i)?.[1]?.trim();
}

const socialFields: Array<[string, (handle: string) => string]> = [
  ["instagram", (handle) => `https://www.instagram.com/${handle}/`],
  ["twitter", (handle) => `https://x.com/${handle}`],
  ["facebook", (handle) => `https://www.facebook.com/${handle}`],
  ["tiktok", (handle) => `https://www.tiktok.com/@${handle}`],
  ["youtube", (handle) => `https://www.youtube.com/${handle.startsWith("UC") ? "channel/" : "@"}${handle}`],
  ["onlyfans", (handle) => `https://onlyfans.com/${handle}`],
  ["reddit", (handle) => `https://www.reddit.com/r/${handle}/`],
  ["camsoda", (handle) => `https://www.camsoda.com/${handle}`],
  ["myfreecams", (handle) => `https://profiles.myfreecams.com/${handle}`],
  ["chaturbate", (handle) => `https://chaturbate.com/${handle}/`],
  ["fansly", (handle) => `https://fansly.com/${handle}`],
  ["fancentro", (handle) => `https://fancentro.com/${handle}`],
  ["patreon", (handle) => `https://www.patreon.com/${handle}`],
  ["twitch", (handle) => `https://www.twitch.tv/${handle}`],
  ["tumblr", (handle) => `https://${handle}.tumblr.com/`],
];

function links(title: string, wikitext: string): string[] {
  const urls = [wikiUrl(title)];
  for (const name of ["homepage", "links"]) {
    const url = directUrl(field(wikitext, name));
    if (url) urls.push(url);
  }
  for (const [name, makeUrl] of socialFields) {
    for (const value of fields(wikitext, name)) {
      const handle = value.replace(/^@/, "").trim();
      if (handle && !/[{}[\]|]/.test(handle)) urls.push(makeUrl(handle));
    }
  }
  for (const value of fields(wikitext, "manyvids")) {
    if (!/[{}[\]|]/.test(value)) urls.push(`https://www.manyvids.com/Profile/${value.replace(/^\/+|\/+$/g, "")}/`);
  }
  const freeones = wikitext.match(/\{\{freeones\|([^}|]+)[^}]*\}\}/i)?.[1]?.trim();
  if (freeones) urls.push(`https://www.freeones.com/${freeones}/bio`);
  const pornhub = wikitext.match(/\{\{pornhub (?:pornstar|model)\|([^}|]+)[^}]*\}\}/i)?.[1]?.trim();
  if (pornhub) urls.push(`https://www.pornhub.com/pornstar/${pornhub}`);
  return [...new Set(urls)];
}

async function api<T>(context: PluginContext, params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, format: "json", formatversion: "2" })) url.searchParams.set(key, value);
  const response = await context.fetch(url, { headers: { "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)" }, signal: context.signal });
  if (!response.ok) throw new Error(`Boobpedia returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadPages(context: PluginContext, params: { pageids?: string; titles?: string }): Promise<WikiPage[]> {
  const payload = await api<{ query?: { pages?: WikiPage[] } }>(context, {
    action: "query", prop: "revisions|info", rvprop: "content", rvslots: "main", inprop: "url", ...(params.pageids ? { pageids: params.pageids } : { titles: params.titles! }),
  });
  return payload.query?.pages ?? [];
}

async function images(context: PluginContext, filenames: string[]): Promise<Map<string, string>> {
  if (!filenames.length) return new Map();
  const payload = await api<{ query?: { pages?: WikiPage[] } }>(context, {
    action: "query", titles: filenames.map((name) => `File:${name}`).join("|"), prop: "imageinfo", iiprop: "url", iiurlwidth: "500",
  });
  return new Map((payload.query?.pages ?? []).flatMap((page) => {
    const url = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url;
    return url ? [[page.title.replace(/^File:/i, ""), url] as const] : [];
  }));
}

function isPerformer(wikitext: string): boolean {
  return /^\{\{\s*Biobox(?:\s+new)?\b/im.test(wikitext);
}

function makeCandidate(page: WikiPage, imageUrls: Map<string, string>): PersonCandidate {
  const wikitext = content(page);
  const photo = fileName(wikitext);
  const aliases = plain(field(wikitext, "alias") ?? "").split(/\s*[,;]\s*/).filter(Boolean);
  return {
    externalId: page.title,
    name: plain(field(wikitext, "name") ?? page.title),
    aliases,
    imageUrl: photo ? imageUrls.get(photo) : undefined,
    profileUrls: links(page.title, wikitext),
    metadata: { origin: "boobpedia", pageId: page.pageid },
  };
}

export default definePlugin({
  manifest: {
    id: "org.easyx.boobpedia",
    name: "Boobpedia",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://www.boobpedia.com",
    description: "Search Boobpedia's public MediaWiki API and extract aliases plus known official and social profiles. No API key required.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const data = await api<{ query?: { general?: { sitename?: string } } }>(context, { action: "query", meta: "siteinfo", siprop: "general" });
    return { ok: true, message: `Connected to ${data.query?.general?.sitename ?? "Boobpedia"}. No API key is required.` };
  },
  async searchPeople(context, query) {
    const search = await api<{ query?: { search?: SearchResult[] } }>(context, {
      action: "query", list: "search", srsearch: query, srnamespace: "0", srlimit: "15",
    });
    const hits = search.query?.search ?? [];
    const pages = (await loadPages(context, { pageids: hits.map((hit) => String(hit.pageid)).join("|") })).filter((page) => isPerformer(content(page)));
    const names = pages.map((page) => fileName(content(page))).filter((name): name is string => Boolean(name));
    const imageUrls = await images(context, names);
    return pages.map((page) => makeCandidate(page, imageUrls)).slice(0, 8);
  },
  async discoverSources(context, performer): Promise<SourceCandidate[]> {
    const title = performer.externalRefs["org.easyx.boobpedia"];
    if (!title) return [];
    const page = (await loadPages(context, { titles: title }))[0];
    if (!page) return [];
    return links(page.title, content(page)).map((profileUrl) => ({ externalId: profileUrl, label: domainFromUrl(profileUrl), profileUrl, domain: domainFromUrl(profileUrl) }));
  },
});
