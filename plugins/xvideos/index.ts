import fs from "node:fs";
import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { decodeHtml } from "../browser-html-utils.js";
import { configuredArgs, playlistCandidates, positiveInteger, runYtDlpJson, testYtDlp, ytDlpDownload } from "../yt-dlp-utils.js";

const XVIDEOS_HOME = "https://www.xvideos.com/";
const PROFILE_PATH = /^\/(?:profiles|channels|pornstars|amateur-channels)\/[^/?#]+\/?$/i;

type XVideosListingVideo = {
  id?: string | number;
  eid?: string | number;
  u?: string;
  t?: string;
  tf?: string;
  i?: string;
  il?: string;
  ut?: string | number | null;
};

type XVideosListing = {
  current_page?: number;
  nb_per_page?: number;
  nb_videos?: number;
  videos?: XVideosListingVideo[];
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function requestSignal(context: PluginContext): AbortSignal {
  const timeout = AbortSignal.timeout(45_000);
  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
}

function cookieHeader(config: Record<string, unknown>): string | undefined {
  const cookiesFile = text(config.cookiesFile);
  if (!cookiesFile) return undefined;
  let contents: string;
  try { contents = fs.readFileSync(cookiesFile, "utf8"); }
  catch { throw new Error("The stored XVideos session could not be read. Reconnect the account in the integrated browser."); }
  const now = Date.now() / 1000;
  const cookies = contents.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice("#HttpOnly_".length) : rawLine;
    if (!line || line.startsWith("#")) return [];
    const parts = line.split("\t");
    if (parts.length < 7) return [];
    const domain = parts[0].replace(/^\./, "").toLowerCase();
    const expiry = Number(parts[4]);
    if (!(domain === "xvideos.com" || domain.endsWith(".xvideos.com")) || (Number.isFinite(expiry) && expiry > 0 && expiry <= now)) return [];
    return [`${parts[5]}=${parts.slice(6).join("\t")}`];
  });
  if (!cookies.length) throw new Error("The stored XVideos session is empty or expired. Reconnect the account in the integrated browser.");
  return cookies.join("; ");
}

function requestHeaders(cookie?: string, referer = XVIDEOS_HOME): Record<string, string> {
  return {
    accept: "application/json,text/html;q=0.9",
    "accept-language": "en-US,en;q=0.8",
    referer,
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ...(cookie ? { cookie } : {}),
  };
}

function supportedProfileUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("XVideos received an invalid profile URL"); }
  const hostname = url.hostname.toLowerCase();
  if (!/(^|\.)xvideos(?:2\.com|\.com|\.es)$/i.test(hostname) || !PROFILE_PATH.test(url.pathname)) {
    throw new Error("XVideos profile scans require a /profiles/, /channels/, /pornstars/, or /amateur-channels/ URL");
  }
  url.hash = "";
  url.search = "";
  return url;
}

function isSingleVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^\/video\.?[a-z0-9]+(?:\/|$)/i.test(url.pathname)
      || /^\/(?:embedframe|swf\/xv-player\.swf)/i.test(url.pathname)
      || /^#quickies\/a\/[a-z0-9]+$/i.test(url.hash);
  } catch { return false; }
}

function publicationDate(value: unknown): string | undefined {
  const raw = identifier(value);
  if (!raw) return undefined;
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
    : new Date(raw);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function pageUrl(video: XVideosListingVideo): string | undefined {
  const id = identifier(video.eid) ?? identifier(video.id);
  if (!id) return undefined;
  const listingUrl = text(video.u);
  const slug = listingUrl?.split(/[?#]/, 1)[0].split("/").filter(Boolean).at(-1) ?? "video";
  return `${XVIDEOS_HOME}video${/^\d+$/.test(id) ? "" : "."}${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
}

export function parseXVideosListing(payload: unknown, sourceUrl: string): MediaCandidate[] {
  const listing = payload && typeof payload === "object" ? payload as XVideosListing : {};
  const found = new Map<string, MediaCandidate>();
  for (const video of Array.isArray(listing.videos) ? listing.videos : []) {
    const id = identifier(video.eid) ?? identifier(video.id);
    const url = pageUrl(video);
    if (!id || !url) continue;
    found.set(id, {
      externalId: `xvideos:${id}`,
      identityKey: `xvideos:${id}`,
      title: decodeHtml(text(video.tf) ?? text(video.t) ?? id),
      pageUrl: url,
      mediaType: "video",
      publishedAt: publicationDate(video.ut),
      filename: `${id}.mp4`,
      metadata: { extractorUrl: url, sourceUrl, thumbnailUrl: text(video.il) ?? text(video.i) },
    });
  }
  return [...found.values()];
}

async function canonicalProfile(context: PluginContext, sourceUrl: string, cookie?: string): Promise<URL> {
  const requested = supportedProfileUrl(sourceUrl);
  const response = await context.fetch(requested, { headers: requestHeaders(cookie), redirect: "follow", signal: requestSignal(context) });
  if (!response.ok) throw new Error(`XVideos returned HTTP ${response.status} for the profile page`);
  const html = await response.text();
  if (/cf-chl-|<title>\s*just a moment/i.test(html)) throw new Error("XVideos presented an anti-bot challenge. Reconnect the account or try again later.");
  const canonical = supportedProfileUrl(response.url || requested.href);
  if (!/XVIDEOS/i.test(html)) throw new Error("XVideos returned an unexpected profile page");
  return canonical;
}

async function listingPage(context: PluginContext, profile: URL, page: number, cookie?: string): Promise<XVideosListing> {
  const url = new URL(`${profile.pathname.replace(/\/$/, "")}/videos/new/${page}`, profile.origin);
  const response = await context.fetch(url, {
    method: "POST",
    headers: { ...requestHeaders(cookie, profile.href), "x-requested-with": "XMLHttpRequest" },
    signal: requestSignal(context),
  });
  if (!response.ok) throw new Error(`XVideos returned HTTP ${response.status} while listing profile videos`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!/json/i.test(contentType)) throw new Error("XVideos returned an unexpected response while listing profile videos");
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error("XVideos returned invalid profile video metadata"); }
  const listing = payload && typeof payload === "object" ? payload as XVideosListing : {};
  if (!Array.isArray(listing.videos)) throw new Error("XVideos did not expose the profile's public videos");
  return listing;
}

async function profileCandidates(context: PluginContext, sourceUrl: string, maxItems: number): Promise<MediaCandidate[]> {
  const cookie = cookieHeader(context.config);
  const profile = await canonicalProfile(context, sourceUrl, cookie);
  const first = await listingPage(context, profile, 0, cookie);
  const perPage = Math.max(1, Number(first.nb_per_page) || first.videos?.length || 36);
  const total = Math.max(first.videos?.length ?? 0, Number(first.nb_videos) || 0);
  const pageCount = Math.min(Math.ceil(maxItems / perPage), Math.ceil(total / perPage));
  const pages = [first];
  for (let page = 1; page < pageCount; page += 1) pages.push(await listingPage(context, profile, page, cookie));
  const found = new Map<string, MediaCandidate>();
  for (const page of pages) {
    for (const item of parseXVideosListing(page, sourceUrl)) {
      found.set(item.externalId, item);
      if (found.size >= maxItems) return [...found.values()];
    }
  }
  return [...found.values()];
}

export default definePlugin({
  manifest: {
    id: "org.easyx.xvideos",
    name: "XVideos",
    version: "1.1.0",
    author: "Open EasyX",
    homepage: "https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/xvideos.py",
    description: "List public XVideos profile and channel videos, or inspect an individual video, then download selected media with yt-dlp.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: [
      "http://xvideos.com/video*", "https://xvideos.com/video*", "http://*.xvideos.com/video*", "https://*.xvideos.com/video*",
      "http://xvideos2.com/video*", "https://xvideos2.com/video*", "http://*.xvideos2.com/video*", "https://*.xvideos2.com/video*",
      "http://xvideos.es/video*", "https://xvideos.es/video*", "http://*.xvideos.es/video*", "https://*.xvideos.es/video*",
      "http://www.xvideos.com/embedframe/*", "https://www.xvideos.com/embedframe/*", "http://flashservice.xvideos.com/embedframe/*", "https://flashservice.xvideos.com/embedframe/*",
      "http://xvideos.com/profiles/*", "https://xvideos.com/profiles/*", "http://*.xvideos.com/profiles/*", "https://*.xvideos.com/profiles/*",
      "http://xvideos.com/channels/*", "https://xvideos.com/channels/*", "http://*.xvideos.com/channels/*", "https://*.xvideos.com/channels/*",
      "http://xvideos.com/pornstars/*", "https://xvideos.com/pornstars/*", "http://*.xvideos.com/pornstars/*", "https://*.xvideos.com/pornstars/*",
      "http://xvideos.com/amateur-channels/*", "https://xvideos.com/amateur-channels/*", "http://*.xvideos.com/amateur-channels/*", "https://*.xvideos.com/amateur-channels/*",
    ],
    polling: { mode: "periodic", defaultIntervalSeconds: 21_600, minimumIntervalSeconds: 900 },
    browserAuth: { loginUrl: "https://www.xvideos.com/account/signin", sessionSetting: "cookiesFile" },
    settings: [
      { key: "maxItems", label: "Maximum videos per scan", type: "number", default: 100 },
      { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["xvideos.com"], help: "Optional. Public videos normally do not require an account session." },
    ],
  },
  async testConnection(context) {
    const extractor = await testYtDlp(context, "XVideos");
    if (!extractor.ok) return extractor;
    try {
      const response = await context.fetch(XVIDEOS_HOME, { headers: requestHeaders(cookieHeader(context.config)), signal: requestSignal(context) });
      if (!response.ok) return { ok: false, message: `XVideos returned HTTP ${response.status}` };
      return { ok: true, message: `${extractor.message} XVideos is reachable.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
  async listMedia(context, source) {
    if (!isSingleVideoUrl(source.profileUrl)) return profileCandidates(context, source.profileUrl, positiveInteger(context.config.maxItems, 100, 500));
    const info = await runYtDlpJson(context, [
      "--dump-single-json", "--skip-download", "--referer", XVIDEOS_HOME,
      ...configuredArgs(context.config), source.profileUrl,
    ], 120_000);
    return playlistCandidates(info, source.profileUrl, "xvideos", 1);
  },
  async resolveDownload(context, item) { return ytDlpDownload(item, context.config, { referer: XVIDEOS_HOME }); },
});
