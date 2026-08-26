import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { downloadRequest, filterMedia, mediaFilters } from "../media-utils.js";

type PublicXRecord = {
  id: string;
  title?: string;
  pageUrl: string;
  url: string;
  mediaType: "image" | "video";
  filename: string;
  publishedAt?: string;
  width?: number;
  height?: number;
};

export function parsePublicXRecords(output: string): MediaCandidate[] {
  let records: PublicXRecord[];
  try { records = JSON.parse(output) as PublicXRecord[]; }
  catch { throw new Error("The public X scraper returned invalid JSON"); }
  if (!Array.isArray(records)) throw new Error("The public X scraper returned an unexpected document");
  return records.filter((record) => record && typeof record.id === "string" && /^https?:\/\//.test(record.url)).map((record) => ({
    externalId: record.id,
    identityKey: record.id,
    title: record.title,
    pageUrl: record.pageUrl,
    mediaType: record.mediaType,
    publishedAt: record.publishedAt,
    filename: record.filename,
    qualityScore: Number(record.width ?? 0) * Number(record.height ?? 0),
    metadata: { downloadUrl: record.url },
  }));
}

async function publicXMedia(context: PluginContext, sourceUrl: string, maxItems: number): Promise<MediaCandidate[]> {
  let result;
  try {
    result = await context.runCommand("easyx-x-scrape", [sourceUrl, String(maxItems)], { timeoutMs: 180_000, maxOutputBytes: 25 * 1024 * 1024 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("The public X scraper is available in the EasyX Docker image");
    throw error;
  }
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `The public X scraper exited with code ${result.exitCode}`);
  return parsePublicXRecords(result.stdout);
}

export default definePlugin({
  manifest: {
    id: "org.easyx.x",
    name: "X (Twitter)",
    version: "2.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/raccommode/OpenEasyX",
    description: "List and download photos and videos from public X profiles and posts without an account or developer API key.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://x.com/*", "https://x.com/*", "http://www.x.com/*", "https://www.x.com/*", "http://twitter.com/*", "https://twitter.com/*", "http://www.twitter.com/*", "https://www.twitter.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum media per scan", type: "number", default: 30 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async testConnection(context) {
    try {
      const result = await context.runCommand("easyx-x-scrape", ["--version"], { timeoutMs: 15_000, maxOutputBytes: 128 * 1024 });
      return result.exitCode === 0
        ? { ok: true, message: "Public X extraction is ready (no account or developer API key required)." }
        : { ok: false, message: result.stderr.trim() || `Public X scraper exited with code ${result.exitCode}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
  async listMedia(context, source) {
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(await publicXMedia(context, source.profileUrl, maxItems), context.config);
  },
  async resolveDownload(context, item) {
    if (!item.pageUrl) return downloadRequest(item);
    const refreshed = await publicXMedia(context, item.pageUrl, 20);
    return downloadRequest(refreshed.find((candidate) => candidate.identityKey === item.identityKey) ?? item);
  },
});
