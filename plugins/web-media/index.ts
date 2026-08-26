import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { directCandidate, downloadRequest, extractHtmlMedia, filterMedia, mediaFilters } from "../media-utils.js";

export default definePlugin({
  manifest: {
    id: "org.easyx.web-media",
    name: "Web Media",
    version: "1.0.0",
    author: "Open EasyX",
    description: "Find direct images, videos, archives, Open Graph media, and linked media files on a public web page.",
    capabilities: ["media-listing", "download-resolver"],
    fallback: true,
    sourceUrlPatterns: ["http://*", "https://*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 21600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum items per URL", type: "number", default: 200 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async listMedia(context, source) {
    const response = await context.fetch(source.profileUrl, { redirect: "follow", signal: context.signal, headers: { "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)", accept: "text/html,application/xhtml+xml,image/*,video/*;q=0.9,*/*;q=0.5" } });
    if (!response.ok) throw new Error(`Web page returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const finalUrl = response.url || source.profileUrl;
    if (contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.includes("application/zip")) {
      return filterMedia([directCandidate(finalUrl, { hint: contentType, pageUrl: source.profileUrl, expectedBytes: Number(response.headers.get("content-length") || 0) || undefined })], context.config);
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 10_000_000) throw new Error("Web page is larger than the 10 MB parsing limit");
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(extractHtmlMedia(await response.text(), finalUrl, source.profileUrl, maxItems), context.config);
  },
  async resolveDownload(_context, item) { return downloadRequest(item); },
});
