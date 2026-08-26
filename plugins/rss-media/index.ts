import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { downloadRequest, extractFeedMedia, filterMedia, mediaFilters } from "../media-utils.js";

export default definePlugin({
  manifest: {
    id: "org.easyx.rss-media",
    name: "RSS / Atom Media",
    version: "1.0.0",
    author: "Open EasyX",
    description: "Read public RSS or Atom feeds and collect direct media enclosures and media embedded in entries.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://*/feed*", "https://*/feed*", "http://*/rss*", "https://*/rss*", "http://*.rss*", "https://*.rss*", "http://*.xml*", "https://*.xml*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum items per feed", type: "number", default: 200 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async listMedia(context, source) {
    const response = await context.fetch(source.profileUrl, { signal: context.signal, headers: { "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)", accept: "application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" } });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(extractFeedMedia(await response.text(), response.url || source.profileUrl, maxItems), context.config);
  },
  async resolveDownload(_context, item) { return downloadRequest(item); },
});
