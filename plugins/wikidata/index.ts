import { definePlugin, type PersonCandidate, type PluginContext, type SourceCandidate } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";

const API = "https://www.wikidata.org/w/api.php";
const ADULT_WORDS = /\b(adult|erotic|glamour|nude|porn|pornographic|sex worker)\b/i;
const HUMAN = "Q5";
const ADULT_OCCUPATIONS = new Set(["Q488111", "Q4610556", "Q1165953", "Q130857"]);

type SearchHit = { id: string; label?: string; description?: string };
type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string; url?: string }>;
};

function stringClaim(entity: Entity, property: string): string | undefined {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? value : undefined;
}

function entityIds(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] ?? []).flatMap((claim) => {
    const value = claim.mainsnak?.datavalue?.value;
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") return [];
    return [value.id];
  });
}

function imageUrl(entity: Entity): string | undefined {
  const filename = stringClaim(entity, "P18");
  return filename ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replaceAll(" ", "_"))}?width=500` : undefined;
}

function profileUrls(entity: Entity): string[] {
  const urls = [`https://www.wikidata.org/wiki/${entity.id}`];
  const wikipedia = entity.sitelinks?.enwiki;
  if (wikipedia) urls.push(wikipedia.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipedia.title.replaceAll(" ", "_"))}`);
  const official = stringClaim(entity, "P856");
  if (official) urls.push(official);
  const socialProperties: Array<[string, (value: string) => string]> = [
    ["P2002", (value) => `https://x.com/${value}`],
    ["P2003", (value) => `https://www.instagram.com/${value}/`],
    ["P2013", (value) => `https://www.facebook.com/${value}`],
    ["P2397", (value) => `https://www.youtube.com/channel/${value}`],
    ["P7085", (value) => `https://www.tiktok.com/@${value}`],
  ];
  for (const [property, makeUrl] of socialProperties) {
    const value = stringClaim(entity, property);
    if (value) urls.push(makeUrl(value));
  }
  return [...new Set(urls)];
}

function isRelevant(entity: Entity, hit?: SearchHit): boolean {
  if (!entityIds(entity, "P31").includes(HUMAN)) return false;
  const occupations = entityIds(entity, "P106");
  const description = hit?.description ?? entity.descriptions?.en?.value ?? "";
  return ADULT_WORDS.test(description) || occupations.some((occupation) => ADULT_OCCUPATIONS.has(occupation));
}

async function getJson<T>(context: PluginContext, params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, format: "json", origin: "*" })) url.searchParams.set(key, value);
  const response = await context.fetch(url, { headers: { "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)" }, signal: context.signal });
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadEntities(context: PluginContext, ids: string[]): Promise<Record<string, Entity>> {
  if (!ids.length) return {};
  const payload = await getJson<{ entities?: Record<string, Entity> }>(context, {
    action: "wbgetentities", ids: ids.join("|"), props: "labels|aliases|descriptions|claims|sitelinks", languages: "en|mul",
  });
  return payload.entities ?? {};
}

function candidate(entity: Entity, hit?: SearchHit): PersonCandidate {
  const aliases = [...(entity.aliases?.en ?? []), ...(entity.aliases?.mul ?? [])].map((alias) => alias.value);
  return {
    externalId: entity.id,
    name: hit?.label ?? entity.labels?.en?.value ?? entity.labels?.mul?.value ?? entity.id,
    aliases: [...new Set(aliases)],
    imageUrl: imageUrl(entity),
    profileUrls: profileUrls(entity),
    metadata: { origin: "wikidata", description: hit?.description ?? entity.descriptions?.en?.value },
  };
}

export default definePlugin({
  manifest: {
    id: "org.easyx.wikidata",
    name: "Wikidata",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://www.wikidata.org",
    description: "Search Wikidata's open knowledge graph for adult performers, aliases, images, official sites, and social profiles. No API key required.",
    capabilities: ["identity-search", "source-discovery"],
  },
  async testConnection(context) {
    const data = await getJson<{ query?: { general?: { sitename?: string } } }>(context, { action: "query", meta: "siteinfo", siprop: "general" });
    return { ok: true, message: `Connected to ${data.query?.general?.sitename ?? "Wikidata"}. No API key is required.` };
  },
  async searchPeople(context, query) {
    const search = await getJson<{ search?: SearchHit[] }>(context, {
      action: "wbsearchentities", search: query, language: "en", uselang: "en", type: "item", limit: "12",
    });
    const hits = search.search ?? [];
    const entities = await loadEntities(context, hits.map((hit) => hit.id));
    return hits.flatMap((hit) => {
      const entity = entities[hit.id];
      return entity && isRelevant(entity, hit) ? [candidate(entity, hit)] : [];
    }).slice(0, 8);
  },
  async discoverSources(context, performer): Promise<SourceCandidate[]> {
    const entityId = performer.externalRefs["org.easyx.wikidata"];
    if (!entityId) return [];
    const entity = (await loadEntities(context, [entityId]))[entityId];
    if (!entity) return [];
    return profileUrls(entity).map((profileUrl) => ({ externalId: profileUrl, label: domainFromUrl(profileUrl), profileUrl, domain: domainFromUrl(profileUrl) }));
  },
});
