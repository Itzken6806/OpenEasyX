import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { downloadRequest, extractFeedMedia, filterMedia, mediaFilters } from "../media-utils.js";

export function tumblrFeedUrl(profileUrl: string): string {
  const url = new URL(profileUrl);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname.endsWith(".tumblr.com")) return `https://${hostname}/rss`;
  if (hostname !== "tumblr.com") throw new Error("Tumblr scraper only accepts tumblr.com blog URLs");
  const blog = url.pathname.split("/").filter(Boolean)[0];
  if (!blog || !/^[A-Za-z0-9-]+$/.test(blog)) throw new Error("The Tumblr URL does not contain a public blog name");
  return `https://${blog}.tumblr.com/rss`;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.tumblr",
    name: "Tumblr",
    version: "2.0.0",
    author: "Open EasyX",
    homepage: "https://www.tumblr.com/",
    description: "List and download images and videos from a public Tumblr blog through its native RSS feed without an account or API key.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://tumblr.com/*", "https://tumblr.com/*", "http://www.tumblr.com/*", "https://www.tumblr.com/*", "http://*.tumblr.com/*", "https://*.tumblr.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum media per scan", type: "number", default: 100 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async testConnection() {
    return { ok: true, message: "Public Tumblr RSS extraction is ready (no account or API key required)." };
  },
  async listMedia(context, source) {
    const feedUrl = tumblrFeedUrl(source.profileUrl);
    const response = await context.fetch(feedUrl, {
      signal: context.signal,
      redirect: "follow",
      headers: { "user-agent": "OpenEasyX/1.0 (+https://github.com/raccommode/OpenEasyX)", accept: "application/rss+xml,application/xml,text/xml" },
    });
    if (!response.ok) throw new Error(`Tumblr public RSS returned HTTP ${response.status}`);
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(extractFeedMedia(await response.text(), feedUrl, maxItems), context.config);
  },
  async resolveDownload(_context, item) { return downloadRequest(item); },
});
