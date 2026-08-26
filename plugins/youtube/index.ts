import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { configuredArgs, playlistCandidates, positiveInteger, runYtDlpJson, testYtDlp, ytDlpDownload } from "../yt-dlp-utils.js";

export function youtubeListingUrl(profileUrl: string): string {
  const url = new URL(profileUrl); const parts = url.pathname.split("/").filter(Boolean);
  const isSingle = url.pathname === "/watch" || parts[0] === "shorts" || parts[0] === "playlist" || url.hostname.toLowerCase() === "youtu.be";
  if (!isSingle && !["videos", "shorts", "streams", "playlists"].includes(parts.at(-1) ?? "")) url.pathname = `${url.pathname.replace(/\/+$/, "")}/videos`;
  return url.href;
}

export default definePlugin({
  manifest: {
    id: "org.easyx.youtube",
    name: "YouTube",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/yt-dlp/yt-dlp",
    description: "List videos from a public YouTube channel, handle, playlist, or video URL and download selected media with yt-dlp.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://youtube.com/*", "https://youtube.com/*", "http://www.youtube.com/*", "https://www.youtube.com/*", "http://youtu.be/*", "https://youtu.be/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 21_600, minimumIntervalSeconds: 900 },
    browserAuth: { loginUrl: "https://www.youtube.com/account", sessionSetting: "cookiesFile" },
    settings: [
      { key: "maxItems", label: "Maximum videos per scan", type: "number", default: 100 },
      { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["youtube.com"], help: "Optional for public videos. Paste your own browser Cookie header or import a cookies.txt export." },
    ],
  },
  async testConnection(context) { return testYtDlp(context, "YouTube"); },
  async listMedia(context, source) {
    const maxItems = positiveInteger(context.config.maxItems, 100);
    const listingUrl = youtubeListingUrl(source.profileUrl);
    const info = await runYtDlpJson(context, ["--js-runtimes", "node", "--flat-playlist", "--dump-single-json", "--skip-download", "--playlist-end", String(maxItems), ...configuredArgs(context.config), listingUrl], 180_000);
    return playlistCandidates(info, source.profileUrl, "youtube", maxItems);
  },
  async resolveDownload(context, item) {
    const request = ytDlpDownload(item, context.config, { referer: "https://www.youtube.com/" });
    request.args.unshift("--js-runtimes", "node");
    return request;
  },
});
