import { definePlugin } from "../../packages/plugin-sdk/index.js";
import { configuredArgs, playlistCandidates, runYtDlpJson, testYtDlp, ytDlpDownload } from "../yt-dlp-utils.js";

export default definePlugin({
  manifest: {
    id: "org.easyx.eporner",
    name: "Eporner",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/eporner.py",
    description: "Inspect and download an individual Eporner video with the bundled yt-dlp extractor. Account restrictions are never bypassed.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: [
      "http://eporner.com/hd-porn/*", "https://eporner.com/hd-porn/*", "http://www.eporner.com/hd-porn/*", "https://www.eporner.com/hd-porn/*",
      "http://eporner.com/embed/*", "https://eporner.com/embed/*", "http://www.eporner.com/embed/*", "https://www.eporner.com/embed/*",
      "http://eporner.com/video-*", "https://eporner.com/video-*", "http://www.eporner.com/video-*", "https://www.eporner.com/video-*",
    ],
    polling: { mode: "periodic", defaultIntervalSeconds: 21_600, minimumIntervalSeconds: 900 },
    browserAuth: { loginUrl: "https://www.eporner.com/login/", sessionSetting: "cookiesFile" },
    settings: [
      { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["eporner.com"], help: "Optional. Public videos normally do not require an account session. Use the integrated browser for videos visible to your own account." },
    ],
  },
  async testConnection(context) { return testYtDlp(context, "Eporner"); },
  async listMedia(context, source) {
    const info = await runYtDlpJson(context, [
      "--dump-single-json", "--skip-download", "--referer", "https://www.eporner.com/",
      ...configuredArgs(context.config), source.profileUrl,
    ], 120_000);
    return playlistCandidates(info, source.profileUrl, "eporner", 1);
  },
  async resolveDownload(context, item) { return ytDlpDownload(item, context.config, { referer: "https://www.eporner.com/" }); },
});
