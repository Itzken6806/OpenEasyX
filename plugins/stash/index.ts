import { definePlugin, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { domainFromUrl } from "../../server/utils.js";

type StashPerformer = { id: string; name: string; alias_list: string[]; image_path?: string; urls?: string[] };

function endpoint(context: PluginContext): string {
  const base = String(context.config.url ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Stash URL is required");
  return `${base}/graphql`;
}

async function gql<T>(context: PluginContext, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await context.fetch(endpoint(context), {
    method: "POST",
    headers: { "content-type": "application/json", ...(context.config.apiKey ? { ApiKey: String(context.config.apiKey) } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Stash returned HTTP ${response.status}`);
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).join("; "));
  if (!payload.data) throw new Error("Stash returned no data");
  return payload.data;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.stash",
    name: "Stash",
    version: "0.1.0",
    author: "Open EasyX",
    homepage: "https://stashapp.cc",
    description: "Search your Stash performers, import their known profile links, and ask Stash to scan completed downloads.",
    capabilities: ["identity-search", "source-discovery", "library-hook"],
    settings: [
      { key: "url", label: "Stash server URL", type: "text", required: true, default: "http://stash:9999", placeholder: "http://stash:9999" },
      { key: "apiKey", label: "API key", type: "password", required: false, help: "Sent only to your configured Stash GraphQL endpoint." },
      { key: "scanPath", label: "Path visible to Stash", type: "text", required: false, placeholder: "/media", help: "Use the path Stash sees for the EasyX media volume." },
      { key: "scanAfterDownload", label: "Scan after each download", type: "boolean", default: true },
    ],
  },
  async testConnection(context) {
    const data = await gql<{ version: { version: string } }>(context, "query EasyXVersion { version { version } }");
    return { ok: true, message: `Connected to Stash ${data.version.version}` };
  },
  async searchPeople(context, query) {
    const data = await gql<{ findPerformers: { performers: StashPerformer[] } }>(context, `
      query EasyXPerformers($filter: FindFilterType) {
        findPerformers(filter: $filter) { performers { id name alias_list image_path urls } }
      }`, { filter: { q: query, per_page: 25, sort: "name", direction: "ASC" } });
    const stashBase = String(context.config.url);
    return data.findPerformers.performers.map((person) => ({
      externalId: person.id, name: person.name, aliases: person.alias_list,
      imageUrl: person.image_path ? new URL(person.image_path, `${stashBase.replace(/\/+$/, "")}/`).toString() : undefined,
      profileUrls: person.urls ?? [], metadata: { origin: "stash" },
    }));
  },
  async discoverSources(_context, performer) {
    const stashId = performer.externalRefs["org.easyx.stash"];
    if (!stashId) return [];
    const context = _context;
    const data = await gql<{ findPerformer: StashPerformer | null }>(context, `
      query EasyXPerformer($id: ID!) { findPerformer(id: $id) { id name urls } }
    `, { id: stashId });
    return (data.findPerformer?.urls ?? []).map((profileUrl) => ({
      externalId: profileUrl, label: domainFromUrl(profileUrl), profileUrl, domain: domainFromUrl(profileUrl),
    }));
  },
  async afterDownload(context, download) {
    if (context.config.scanAfterDownload === false) return;
    const scanRoot = String(context.config.scanPath ?? "").replace(/\/+$/, "");
    const scanPath = scanRoot ? `${scanRoot}/${download.relativePath}` : download.absolutePath;
    await gql(context, "mutation EasyXScan($input: ScanMetadataInput!) { metadataScan(input: $input) }", { input: { paths: [scanPath] } });
  },
});
