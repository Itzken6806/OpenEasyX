import { createLiveCamPlugin } from "../live-cam-plugin-factory.js";
import { browserHtml } from "../browser-html-utils.js";
import { stripchatStreamConfig } from "../live-cam-discovery.js";

const plugin = createLiveCamPlugin({
  id: "org.easyx.stripchat", name: "Stripchat Live", prefix: "stripchat", homepage: "https://stripchat.com",
  discovery: "stripchat",
  description: "Check a public Stripchat room and play or record its active live stream with yt-dlp and FFmpeg.",
  sourceUrlPatterns: ["http://stripchat.com/*", "https://stripchat.com/*", "http://www.stripchat.com/*", "https://www.stripchat.com/*"],
  cookieDomains: ["stripchat.com"], loginUrl: "https://stripchat.com/login", minimumIntervalSeconds: 5, defaultIntervalSeconds: 10,
});

const genericResolveLiveStream = plugin.resolveLiveStream!;
plugin.resolveLiveStream = async (context, cam) => {
  try {
    const stream = stripchatStreamConfig(await browserHtml(context, cam.pageUrl));
    if (!stream?.domains.length) throw new Error("The public room did not expose an HLS host");
    const headers = { referer: "https://stripchat.com/", origin: "https://stripchat.com" };
    for (const domain of stream.domains) {
      const url = `https://edge-hls.${domain}/hls/${encodeURIComponent(stream.modelId)}/master/${encodeURIComponent(stream.modelId)}_auto.m3u8`;
      try {
        const response = await context.fetch(url, { headers, signal: context.signal ?? AbortSignal.timeout(15_000) });
        if (response.ok && (await response.text()).trimStart().startsWith("#EXTM3U")) return { url, headers, contentType: "application/vnd.apple.mpegurl" };
      } catch { /* Try the next CDN host. */ }
    }
    throw new Error("No public Stripchat HLS host returned a playable manifest");
  } catch (error) {
    context.log("debug", "Stripchat direct HLS resolution failed; trying generic extraction", error instanceof Error ? error.message : String(error));
    return genericResolveLiveStream(context, cam);
  }
};

export default plugin;
