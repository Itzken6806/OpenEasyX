import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { galleryDownload, listGalleryMedia, normalizeProfileUrl, testGalleryDl } from "../gallery-dl-utils.js";
import { filterMedia, mediaFilters } from "../media-utils.js";
import { playlistCandidates, runYtDlpJson, testYtDlp, ytDlpDownload } from "../yt-dlp-utils.js";

async function batched<T, R>(values: T[], size: number, operation: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += size) results.push(...await Promise.all(values.slice(index, index + size).map(operation)));
  return results;
}

function ytDlpSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.search = ""; url.hash = "";
  url.pathname = url.pathname.replace(/\/(?:posts)\/?$/, "").replace(/\/+$/, "");
  return url.href;
}

export async function publicTikTokMedia(context: PluginContext, sourceUrl: string, maxItems: number): Promise<MediaCandidate[]> {
  const galleryUrl = normalizeProfileUrl(sourceUrl, "tiktok");
  try {
    const direct = await listGalleryMedia({ ...context, config: { ...context.config, maxItems } }, galleryUrl, "tiktok");
    if (direct.length) return direct.slice(0, maxItems);
  } catch (error) {
    context.log("warn", "TikTok profile extraction is using the anonymous post-by-post fallback", error instanceof Error ? error.message : String(error));
  }

  const info = await runYtDlpJson(context, ["--impersonate", "chrome", "--flat-playlist", "--playlist-end", String(maxItems), "--dump-single-json", ytDlpSourceUrl(sourceUrl)], 180_000);
  const posts = playlistCandidates(info, sourceUrl, "tiktok", maxItems);
  if (!posts.length) throw new Error("TikTok returned no public posts for this profile");
  const media = (await batched(posts, 4, async (post) => {
    try {
      const extracted = await listGalleryMedia({ ...context, config: { ...context.config, maxItems: 50 } }, post.pageUrl!, "tiktok");
      return extracted.length ? extracted : [post];
    } catch (error) {
      context.log("warn", `TikTok public post extraction failed for ${post.pageUrl}`, error instanceof Error ? error.message : String(error));
      return [post];
    }
  })).flat();
  return [...new Map(media.map((item) => [item.identityKey ?? item.externalId, item])).values()].slice(0, maxItems);
}

export default definePlugin({
  manifest: {
    id: "org.easyx.tiktok",
    name: "TikTok",
    version: "2.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/mikf/gallery-dl",
    description: "List and download public TikTok videos and photo slideshows without a browser session or API key.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://tiktok.com/*", "https://tiktok.com/*", "http://www.tiktok.com/*", "https://www.tiktok.com/*", "http://vm.tiktok.com/*", "https://vm.tiktok.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum media per scan", type: "number", default: 30 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async testConnection(context) {
    const [gallery, video] = await Promise.all([testGalleryDl(context, "TikTok photo"), testYtDlp(context, "TikTok video")]);
    return gallery.ok && video.ok
      ? { ok: true, message: "Public TikTok photo and video extraction is ready (no account or API key required)." }
      : { ok: false, message: [gallery.message, video.message].join(" ") };
  },
  async listMedia(context, source) {
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(await publicTikTokMedia(context, source.profileUrl, maxItems), context.config);
  },
  async resolveDownload(context, item) {
    return typeof item.metadata?.galleryFilename === "string"
      ? galleryDownload(item, context.config, "tiktok")
      : ytDlpDownload(item, context.config, { referer: item.pageUrl, impersonate: "chrome" });
  },
});
