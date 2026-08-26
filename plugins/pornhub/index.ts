import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { configuredArgs, playlistCandidates, positiveInteger, runYtDlpJson, testYtDlp, ytDlpDownload } from "../yt-dlp-utils.js";

export default definePlugin({
  manifest: {
    id: "org.easyx.pornhub",
    name: "Pornhub",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/yt-dlp/yt-dlp",
    description: "List public Pornhub profile, model, pornstar, and channel videos with yt-dlp and download the selected original stream.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://pornhub.com/*", "https://pornhub.com/*", "http://www.pornhub.com/*", "https://www.pornhub.com/*", "http://*.pornhub.com/*", "https://*.pornhub.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 21_600, minimumIntervalSeconds: 900 },
    browserAuth: { loginUrl: "https://www.pornhub.com/login", sessionSetting: "cookiesFile" },
    settings: [
      { key: "maxItems", label: "Maximum videos per scan", type: "number", default: 100 },
      { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["pornhub.com"], help: "Optional for public pages. Paste your own browser Cookie header or import a cookies.txt export." },
    ],
  },
  async testConnection(context) { return testYtDlp(context, "Pornhub"); },
  async listMedia(context, source) {
    const maxItems = positiveInteger(context.config.maxItems, 100);
    const info = await runYtDlpJson(context, [
      "--flat-playlist", "--dump-single-json", "--skip-download", "--playlist-end", String(maxItems),
      ...configuredArgs(context.config), source.profileUrl,
    ], 180_000);
    return playlistCandidates(info, source.profileUrl, "pornhub", maxItems);
  },
  async resolveDownload(context, item) { return ytDlpDownload(item, context.config, { referer: "https://www.pornhub.com/" }); },
});
