import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { downloadRequest, extractFeedMedia, filterMedia, mediaFilters } from "../media-utils.js";

function redditFeed(profileUrl: string): string {
  const url = new URL(profileUrl);
  if (!/(^|\.)reddit\.com$/i.test(url.hostname)) throw new Error("Reddit RSS only supports reddit.com URLs");
  url.hostname = "www.reddit.com";
  url.search = ""; url.hash = "";
  const parts = url.pathname.split("/").filter(Boolean);
  if (["user", "u"].includes(parts[0]?.toLowerCase()) && parts[1]) url.pathname = `/user/${parts[1]}/submitted/.rss`;
  else url.pathname = `${url.pathname.replace(/\/?(?:\.rss)?$/, "")}/.rss`.replace(/\/+/g, "/");
  return url.href;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.reddit-rss",
    name: "Reddit RSS",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://www.reddit.com",
    description: "Collect public images and videos exposed by a subreddit or user RSS feed. No Reddit API key is required.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://reddit.com/r/*", "https://reddit.com/r/*", "http://www.reddit.com/r/*", "https://www.reddit.com/r/*", "http://reddit.com/user/*", "https://reddit.com/user/*", "http://www.reddit.com/user/*", "https://www.reddit.com/user/*", "http://reddit.com/u/*", "https://reddit.com/u/*", "http://www.reddit.com/u/*", "https://www.reddit.com/u/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 1800, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum items per feed", type: "number", default: 100 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
      { key: "userAgent", label: "Reddit User-Agent", type: "text", default: "cherrycrush-reddit-archiver/1.0", help: "Reddit rate-limits generic clients. Change this only if your deployment uses a registered, descriptive identifier." },
    ],
  },
  async listMedia(context, source) {
    const feedUrl = redditFeed(source.profileUrl);
    const userAgent = typeof context.config.userAgent === "string" && context.config.userAgent.trim() ? context.config.userAgent.trim() : "cherrycrush-reddit-archiver/1.0";
    const response = await context.fetch(feedUrl, { signal: context.signal, headers: { "user-agent": userAgent, accept: "application/json, application/atom+xml;q=0.9, */*;q=0.8" } });
    if (!response.ok) throw new Error(`Reddit RSS returned HTTP ${response.status}`);
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(extractFeedMedia(await response.text(), feedUrl, maxItems), context.config);
  },
  async resolveDownload(_context, item) { return downloadRequest(item); },
});

export { redditFeed };
