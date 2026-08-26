import fs from "node:fs";
import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { decodeHtml } from "../browser-html-utils.js";
import { positiveInteger, ytDlpDownload } from "../yt-dlp-utils.js";

type ManyVidsCreator = { id?: string | number; slug?: string; stageName?: string; displayName?: string; profileUrl?: string };
type ManyVidsVideo = {
  id: string | number;
  title: string;
  slug?: string;
  preview?: { url?: string };
  launchDate?: string;
  creator?: ManyVidsCreator;
  model?: ManyVidsCreator;
  creatorId?: string | number;
  creator_id?: string | number;
  modelId?: string | number;
  model_id?: string | number;
};
type PurchasedPage = {
  statusCode?: number;
  data?: ManyVidsVideo[] | { purchased?: ManyVidsVideo[]; videos?: ManyVidsVideo[]; items?: ManyVidsVideo[]; results?: ManyVidsVideo[] };
  pagination?: { page?: number; currentPage?: number; totalPages?: number };
};
type CreatorEntitlements = {
  statusCode?: number;
  data?: { purchased?: Array<string | number>; subscribedToBundle?: boolean };
};

const MANYVIDS_API = "https://api.manyvids.com";
const MANYVIDS_WEB = "https://www.manyvids.com";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identifier(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}

function creatorIdentifier(video: ManyVidsVideo): string | undefined {
  return identifier(video.creator?.id) ?? identifier(video.model?.id)
    ?? identifier(video.creatorId) ?? identifier(video.creator_id)
    ?? identifier(video.modelId) ?? identifier(video.model_id);
}

function purchasedVideos(payload: unknown): ManyVidsVideo[] {
  const page = payload && typeof payload === "object" ? payload as PurchasedPage : {};
  if (Array.isArray(page.data)) return page.data;
  for (const key of ["purchased", "videos", "items", "results"] as const) {
    const records = page.data?.[key];
    if (Array.isArray(records)) return records;
  }
  return [];
}

function flightPayload(html: string): string {
  let payload = "";
  for (const match of html.matchAll(/<script[^>]*>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)) {
    try {
      const chunk = JSON.parse(match[1]) as unknown[];
      if (typeof chunk[1] === "string") payload += chunk[1];
    } catch { /* Ignore unrelated or incomplete React Flight chunks. */ }
  }
  return payload;
}

function jsonObjectAfter(input: string, marker: string): unknown {
  const markerIndex = input.indexOf(marker);
  if (markerIndex < 0) throw new Error("ManyVids did not expose its storefront metadata");
  const start = input.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error("ManyVids returned incomplete storefront metadata");
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return JSON.parse(input.slice(start, index + 1));
  }
  throw new Error("ManyVids returned incomplete storefront metadata");
}

function storefrontFallback(html: string): unknown {
  return jsonObjectAfter(flightPayload(html), '"swrFallback":');
}

function collectVideos(value: unknown, found = new Map<string, ManyVidsVideo>()): Map<string, ManyVidsVideo> {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const child of value) collectVideos(child, found);
    return found;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && typeof record.title === "string") {
    const preview = record.preview;
    if (preview && typeof preview === "object" && typeof (preview as Record<string, unknown>).url === "string") found.set(record.id, record as ManyVidsVideo);
  }
  for (const child of Object.values(record)) collectVideos(child, found);
  return found;
}

function videoPage(video: ManyVidsVideo): string {
  const generatedSlug = video.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = text(video.slug) ?? (generatedSlug || "video");
  return `https://www.manyvids.com/Video/${encodeURIComponent(identifier(video.id) ?? "video")}/${encodeURIComponent(slug)}/`;
}

export function parseManyVidsStorefront(html: string, maxItems = 100): MediaCandidate[] {
  return [...collectVideos(storefrontFallback(html)).values()].slice(0, maxItems).map((video) => ({
    externalId: `manyvids:${video.id}:preview`,
    identityKey: `manyvids:${video.id}:preview`,
    title: `${decodeHtml(video.title)} (public preview)`,
    pageUrl: videoPage(video),
    mediaType: "video" as const,
    publishedAt: video.launchDate,
    filename: `${video.id}-preview.mp4`,
    metadata: { extractorUrl: videoPage(video), previewUrl: video.preview?.url, access: "preview" },
  }));
}

export function parseManyVidsPurchasedPage(payload: unknown, access: "purchase" | "custom" | "bundle" | "premium", maxItems = 100): MediaCandidate[] {
  const videos = purchasedVideos(payload);
  const labels = { purchase: "purchased", custom: "custom media", bundle: "bundle access", premium: "Premium access" } as const;
  return videos.filter((video) => (typeof video.id === "string" || typeof video.id === "number") && text(video.title)).slice(0, maxItems).map((video) => ({
    externalId: `manyvids:${String(video.id)}:full`,
    identityKey: `manyvids:${String(video.id)}:full`,
    title: `${decodeHtml(video.title)} (${labels[access]})`,
    pageUrl: videoPage(video),
    mediaType: "video" as const,
    publishedAt: video.launchDate,
    filename: `${String(video.id)}.mp4`,
    metadata: {
      extractorUrl: videoPage(video), access, manyVidsId: String(video.id),
      creatorId: creatorIdentifier(video),
    },
  }));
}

export function parseManyVidsEntitlements(payload: unknown): { purchasedIds: Set<string>; subscribedToBundle: boolean } {
  const page = payload && typeof payload === "object" ? payload as CreatorEntitlements : {};
  return {
    purchasedIds: new Set((Array.isArray(page.data?.purchased) ? page.data.purchased : []).flatMap((value) => identifier(value) ?? [])),
    subscribedToBundle: page.data?.subscribedToBundle === true,
  };
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : undefined;
}

function plainText(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function titleFromSlug(slug: string): string {
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch { /* Keep the original slug. */ }
  return decodeHtml(decoded).replace(/(?:^|-)amp(?:-|$)/gi, " & ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function historyRows(html: string): string[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]).filter((row) => /\/download\.php\?id=/i.test(row));
  const coveredDownloads = new Set(rows.flatMap((row) => [...row.matchAll(/\/download\.php\?[^"']+/gi)].map((match) => decodeHtml(match[0]))));
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])[^"']*\/download\.php\?[^"']+\1[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (!href || coveredDownloads.has(href)) continue;
    const start = Math.max(0, match.index - 4_000); const end = Math.min(html.length, match.index + match[0].length + 2_000);
    rows.push(html.slice(start, end)); coveredDownloads.add(href);
  }
  return rows;
}

function mediaDetails(value: string | undefined, fallbackId: string): { mediaType: MediaCandidate["mediaType"]; filename: string } {
  let name = value?.split(/[?#]/, 1)[0].split("/").filter(Boolean).at(-1) ?? "";
  try { name = decodeURIComponent(name); } catch { /* Keep the encoded server name. */ }
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1].toLowerCase();
  if (extension && ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic"].includes(extension)) return { mediaType: "image", filename: `${fallbackId}.${extension}` };
  if (extension && ["mp4", "m4v", "mov", "webm", "mkv"].includes(extension)) return { mediaType: "video", filename: `${fallbackId}.${extension}` };
  if (extension && ["zip", "rar", "7z", "tar", "gz"].includes(extension)) return { mediaType: "archive", filename: `${fallbackId}.${extension}` };
  return { mediaType: "video", filename: `${fallbackId}.mp4` };
}

export function parseManyVidsHistoryPage(html: string, creatorId: string, maxItems = 100, includeCustom = true): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  for (const row of historyRows(html)) {
    if (candidates.length >= maxItems) break;
    const profile = row.match(/\/Profile\/(\d+)\/([^/"'?]+)/i);
    const video = row.match(/\/Video\/(\d+)\/([^/"'?]+)/i);
    const downloadTag = row.match(/<a\b[^>]*href\s*=\s*(["'])[^"']*\/download\.php\?[^"']+\1[^>]*>/i)?.[0];
    const downloadHref = downloadTag ? attribute(downloadTag, "href") : undefined;
    const videoId = downloadHref?.match(/[?&]id=(\d+)/i)?.[1] ?? video?.[1];
    const isCustom = /class\s*=\s*["'][^"']*customvid|data-type\s*=\s*["']customvid/i.test(row);
    if (!profile || profile[1] !== creatorId || !videoId || !downloadHref || (isCustom && !includeCustom)) continue;

    const videoAnchor = video ? row.match(new RegExp(`<a\\b[^>]*href\\s*=\\s*(["'])[^"']*/Video/${videoId}/[^"']*\\1[^>]*>([\\s\\S]*?)<\\/a>`, "i")) : undefined;
    const customTitle = row.match(/<([a-z0-9]+)\b[^>]*>([\s\S]*?)<\/\1>\s*<a\b[^>]*data-type\s*=\s*(["'])customvid\3/i)?.[2];
    const anchorTitle = plainText(videoAnchor?.[2] ?? "");
    const title = (!/^(?:stream|download|view item)$/i.test(anchorTitle) ? anchorTitle : "") || plainText(customTitle ?? "") || (video ? titleFromSlug(video[2]) : "") || `ManyVids ${isCustom ? "custom" : "purchase"} ${videoId}`;
    const deliveryDate = row.match(/data-delivery-date\s*=\s*(["'])([^"']+)\1/i)?.[2];
    const access = isCustom ? "custom" : "purchase";
    const label = isCustom ? "custom media" : "purchased";
    const absoluteDownloadUrl = new URL(downloadHref, MANYVIDS_WEB).href;
    const pageUrl = video ? `${MANYVIDS_WEB}/Video/${encodeURIComponent(videoId)}/${video[2]}/` : `${MANYVIDS_WEB}/View-my-history/1/`;
    const downloadName = downloadTag ? attribute(downloadTag, "download") : undefined;
    const details = mediaDetails(downloadName ?? downloadHref, videoId);
    candidates.push({
      externalId: `manyvids:${videoId}:full`,
      identityKey: `manyvids:${videoId}:full`,
      title: `${title} (${label})`,
      pageUrl,
      mediaType: details.mediaType,
      publishedAt: deliveryDate?.replace(" ", "T"),
      filename: details.filename,
      metadata: { extractorUrl: pageUrl, downloadUrl: absoluteDownloadUrl, access, manyVidsId: videoId, creatorId: profile[1] },
    });
  }
  return candidates;
}

function storefrontUrl(profileUrl: string): string {
  const url = new URL(profileUrl);
  if (!/(^|\.)manyvids\.com$/i.test(url.hostname)) throw new Error("ManyVids only supports manyvids.com profile URLs");
  url.search = ""; url.hash = "";
  url.pathname = `${url.pathname.replace(/\/(?:Store\/Videos)?\/?$/i, "")}/Store/Videos`;
  return url.href;
}

function creatorIdFromUrl(value: string): string | undefined {
  try { return new URL(value).pathname.match(/\/Profile\/(\d+)(?:\/|$)/i)?.[1]; }
  catch { return undefined; }
}

function creatorIdFromVideos(videos: Iterable<ManyVidsVideo>): string | undefined {
  for (const video of videos) {
    const creatorId = identifier(video.creator?.id) ?? identifier(video.model?.id);
    if (creatorId && /^\d+$/.test(creatorId)) return creatorId;
  }
  return undefined;
}

function cookieHeader(config: Record<string, unknown>): string | undefined {
  const cookiesFile = text(config.cookiesFile);
  if (!cookiesFile) return undefined;
  let contents: string;
  try { contents = fs.readFileSync(cookiesFile, "utf8"); }
  catch { throw new Error("The stored ManyVids session could not be read. Reconnect the account in the integrated browser."); }
  const now = Date.now() / 1000;
  const cookies = contents.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice("#HttpOnly_".length) : rawLine;
    if (!line || line.startsWith("#")) return [];
    const parts = line.split("\t");
    if (parts.length < 7) return [];
    const domain = parts[0].replace(/^\./, "").toLowerCase();
    const expiry = Number(parts[4]);
    if (!(domain === "manyvids.com" || domain.endsWith(".manyvids.com")) || (Number.isFinite(expiry) && expiry > 0 && expiry <= now)) return [];
    return [`${parts[5]}=${parts.slice(6).join("\t")}`];
  });
  if (!cookies.length) throw new Error("The stored ManyVids session is empty or expired. Reconnect the account in the integrated browser.");
  return cookies.join("; ");
}

function requestHeaders(cookie?: string): Record<string, string> {
  return {
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    accept: "application/json,text/html;q=0.9",
    referer: "https://www.manyvids.com/",
    ...(cookie ? { cookie } : {}),
  };
}

function authorizedFileUrl(value: unknown): URL | undefined {
  const fileUrl = text(value);
  let parsed: URL | undefined;
  try { if (fileUrl) parsed = new URL(fileUrl); } catch { return undefined; }
  return parsed?.protocol === "https:" && (parsed.hostname === "manyvids.com" || parsed.hostname.endsWith(".manyvids.com")) ? parsed : undefined;
}

function authorizedFilename(videoId: string, url: URL, suppliedName?: unknown, currentName?: string): string {
  const name = text(suppliedName);
  const details = mediaDetails(name ?? url.pathname, videoId);
  const detectedExtension = details.filename.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  const currentExtension = currentName?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (name || (detectedExtension && detectedExtension !== currentExtension)) return details.filename;
  return currentName ?? details.filename;
}

async function purchasedRequest(context: PluginContext, url: string, cookie: string): Promise<PurchasedPage> {
  const response = await context.fetch(url, { signal: context.signal, headers: requestHeaders(cookie), redirect: "follow" });
  let payload: PurchasedPage;
  try { payload = await response.json() as PurchasedPage; }
  catch { throw new Error(`ManyVids returned an invalid account response (HTTP ${response.status})`); }
  if (!response.ok || (payload.statusCode !== undefined && payload.statusCode !== 200)) {
    if ([401, 403].includes(response.status) || [401, 403].includes(Number(payload.statusCode))) {
      throw new Error("The ManyVids account session is missing or expired. Reconnect it in the integrated browser.");
    }
    throw new Error(`ManyVids returned HTTP ${response.status}`);
  }
  return payload;
}

async function historyRequest(context: PluginContext, page: number, cookie: string): Promise<string> {
  const response = await context.fetch(`${MANYVIDS_WEB}/View-my-history/${page}/`, { signal: context.signal, headers: requestHeaders(cookie), redirect: "follow" });
  const html = await response.text();
  if (!response.ok) throw new Error(`ManyVids returned HTTP ${response.status}`);
  if (/\/Login(?:[/?#]|$)/i.test(response.url) || (!/View-my-history/i.test(html) && /(?:name=["']password|login-form)/i.test(html))) {
    throw new Error("The ManyVids account session is missing or expired. Reconnect it in the integrated browser.");
  }
  return html;
}

async function creatorId(context: PluginContext, profileUrl: string, cookie?: string): Promise<{ id: string; storefrontHtml?: string }> {
  const direct = creatorIdFromUrl(profileUrl);
  if (direct) return { id: direct };
  const response = await context.fetch(storefrontUrl(profileUrl), { signal: context.signal, headers: requestHeaders(cookie), redirect: "follow" });
  if (!response.ok) throw new Error(`ManyVids returned HTTP ${response.status}`);
  const html = await response.text();
  const canonical = creatorIdFromUrl(response.url);
  if (canonical) return { id: canonical, storefrontHtml: html };
  const videos = collectVideos(storefrontFallback(html));
  const discovered = creatorIdFromVideos(videos.values());
  if (!discovered) throw new Error("ManyVids did not expose the numeric creator id for this profile URL");
  return { id: discovered, storefrontHtml: html };
}

async function creatorEntitlements(context: PluginContext, creatorId: string, cookie: string) {
  const payload = await purchasedRequest(context, `${MANYVIDS_API}/store/videos/${encodeURIComponent(creatorId)}/private`, cookie);
  return parseManyVidsEntitlements(payload);
}

async function entitledStoreMedia(
  context: PluginContext,
  creatorId: string,
  maximum: number,
  cookie: string,
  entitlements: { purchasedIds: Set<string>; subscribedToBundle: boolean },
): Promise<MediaCandidate[]> {
  if (!entitlements.purchasedIds.size && !entitlements.subscribedToBundle) return [];
  const found = new Map<string, MediaCandidate>();
  let page = 1; let totalPages = 1;
  while (page <= totalPages && found.size < maximum) {
    const payload = await purchasedRequest(context, `${MANYVIDS_API}/store/videos/${encodeURIComponent(creatorId)}?sort=newest&limit=100&page=${page}`, cookie);
    for (const video of purchasedVideos(payload)) {
      const videoId = identifier(video.id);
      if (!videoId || (!entitlements.subscribedToBundle && !entitlements.purchasedIds.has(videoId))) continue;
      const access = entitlements.purchasedIds.has(videoId) ? "purchase" : "bundle";
      const candidate = parseManyVidsPurchasedPage({ data: [video] }, access, 1)[0];
      if (candidate) found.set(candidate.externalId, candidate);
      if (found.size >= maximum) break;
    }
    totalPages = Math.max(1, Number(payload.pagination?.totalPages ?? 1));
    if (!purchasedVideos(payload).length) break;
    page += 1;
  }
  return [...found.values()];
}

async function purchasedMedia(context: PluginContext, profileUrl: string, maximum: number, cookie: string): Promise<MediaCandidate[]> {
  const creator = await creatorId(context, profileUrl, cookie);
  const found = new Map<string, MediaCandidate>();
  const entitlements = await creatorEntitlements(context, creator.id, cookie);
  for (let page = 1; page <= 100 && found.size < maximum; page += 1) {
    const html = await historyRequest(context, page, cookie);
    const rows = historyRows(html);
    for (const candidate of parseManyVidsHistoryPage(html, creator.id, maximum - found.size, context.config.includeCustomVideos !== false)) {
      if (!found.has(candidate.externalId)) found.set(candidate.externalId, candidate);
    }
    if (!rows.length) break;
  }

  const accessKinds = [
    ...(context.config.includeCustomVideos === false ? [] : [["custom", "sort=custom&"] as const]),
    ["purchase", "sort=newest&"] as const,
    ...(context.config.includeBundleAccess === false ? [] : [["bundle", "bundle=true&"] as const]),
    ...(context.config.includePremiumAccess === false ? [] : [["premium", "premium=true&"] as const]),
  ];
  for (const [access, accessQuery] of accessKinds) {
    let page = 1; let totalPages = 1;
    while (page <= totalPages && found.size < maximum) {
      // ManyVids currently returns an empty page when its creator filter is used,
      // even though the same videos are present in the unfiltered account library.
      // Walk the account pages and apply the creator boundary locally instead.
      const url = `${MANYVIDS_API}/store/library/purchased?${accessQuery}${access === "bundle" || access === "premium" ? "sort=newest&" : ""}limit=100&page=${page}`;
      const payload = await purchasedRequest(context, url, cookie);
      for (const candidate of parseManyVidsPurchasedPage(payload, access, 100)) {
        const candidateCreator = identifier(candidate.metadata?.creatorId);
        const entitledById = entitlements.purchasedIds.has(identifier(candidate.metadata?.manyVidsId) ?? "");
        if (candidateCreator !== creator.id && !entitledById) continue;
        const existing = found.get(candidate.externalId);
        if (!existing || access === "custom") found.set(candidate.externalId, candidate);
        if (found.size >= maximum) break;
      }
      totalPages = Math.max(1, Number(payload.pagination?.totalPages ?? 1));
      const videos = Array.isArray(payload.data) ? payload.data : payload.data?.purchased;
      if (!videos?.length) break;
      page += 1;
    }
  }
  if (found.size < maximum) {
    for (const candidate of await entitledStoreMedia(context, creator.id, maximum - found.size, cookie, entitlements)) {
      if (!found.has(candidate.externalId)) found.set(candidate.externalId, candidate);
    }
  }
  return [...found.values()].slice(0, maximum);
}

export default definePlugin({
  manifest: {
    id: "org.easyx.manyvids",
    name: "ManyVids",
    version: "2.2.0",
    author: "Open EasyX",
    homepage: "https://www.manyvids.com/",
    description: "Connect your own ManyVids account, list purchased videos and delivered custom media plus Vid Bundle and Premium access by creator, and download only files authorized for that session.",
    capabilities: ["media-listing", "download-resolver"],
    browserAuth: { loginUrl: "https://www.manyvids.com/Login", sessionSetting: "cookiesFile", capture: "manyvids" },
    sourceUrlPatterns: ["http://manyvids.com/Profile/*", "https://manyvids.com/Profile/*", "http://www.manyvids.com/Profile/*", "https://www.manyvids.com/Profile/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 21_600, minimumIntervalSeconds: 900 },
    settings: [
      { key: "maxItems", label: "Maximum account media per scan", type: "number", default: 100 },
      { key: "includeCustomVideos", label: "Include delivered custom media", type: "boolean", default: true },
      { key: "includeBundleAccess", label: "Include Vid Bundle access", type: "boolean", default: true },
      { key: "includePremiumAccess", label: "Include Premium access", type: "boolean", default: true },
      { key: "includePublicPreviews", label: "Also include public previews", type: "boolean", default: false },
      { key: "cookiesFile", label: "ManyVids account session", type: "session", required: true, cookieDomains: ["manyvids.com"], help: "Required: sign in with the integrated EasyX browser. Your username and password are entered only on the official ManyVids page; EasyX stores only the resulting session cookies." },
    ],
  },
  async testConnection(context) {
    const cookie = cookieHeader(context.config);
    if (!cookie) {
      return { ok: false, message: "Connect your ManyVids account to list purchased and custom media. Public previews are never used as a substitute for account media." };
    }
    try {
      await Promise.all([
        historyRequest(context, 1, cookie),
        purchasedRequest(context, `${MANYVIDS_API}/store/library/purchased?sort=newest&limit=1&page=1`, cookie),
      ]);
      return { ok: true, message: "ManyVids account session is valid; purchased videos and delivered custom media are ready." };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
  },
  async listMedia(context, source) {
    const maximum = positiveInteger(context.config.maxItems, 100, 500);
    const cookie = cookieHeader(context.config);
    if (!cookie) throw new Error("Connect the ManyVids account before scraping. EasyX will not replace purchased media with public previews.");
    const found = new Map<string, MediaCandidate>();
    for (const candidate of await purchasedMedia(context, source.profileUrl, maximum, cookie)) found.set(candidate.externalId, candidate);
    if (context.config.includePublicPreviews === true) {
      const remaining = Math.max(0, maximum - found.size);
      if (remaining) {
        const response = await context.fetch(storefrontUrl(source.profileUrl), { signal: context.signal, headers: requestHeaders(cookie), redirect: "follow" });
        if (!response.ok) throw new Error(`ManyVids returned HTTP ${response.status}`);
        for (const candidate of parseManyVidsStorefront(await response.text(), remaining)) found.set(candidate.externalId, candidate);
      }
    }
    return [...found.values()].slice(0, maximum);
  },
  async resolveDownload(context, item) {
    const accountMedia = item.externalId.endsWith(":full") || ["purchase", "custom", "bundle", "premium"].includes(String(item.metadata?.access ?? ""));
    if (accountMedia) {
      const cookie = cookieHeader(context.config);
      const videoId = text(item.metadata?.manyVidsId) ?? item.externalId.match(/^manyvids:(\d+):full$/)?.[1];
      if (!cookie || !videoId) throw new Error("Reconnect the ManyVids account before downloading purchased media.");
      const downloadUrl = text(item.metadata?.downloadUrl);
      if (downloadUrl) {
        const response = await context.fetch(downloadUrl, { signal: context.signal, headers: requestHeaders(cookie), redirect: "follow" });
        const payload = await response.json().catch(() => undefined) as {
          original?: { file_url?: unknown; url?: unknown; filename?: unknown; file_name?: unknown };
          file_url?: unknown; url?: unknown;
        } | undefined;
        const parsedFileUrl = authorizedFileUrl(payload?.original?.file_url) ?? authorizedFileUrl(payload?.original?.url)
          ?? authorizedFileUrl(payload?.file_url) ?? authorizedFileUrl(payload?.url);
        if (!response.ok || !parsedFileUrl) {
          throw new Error("ManyVids did not authorize the purchased file for this session. Reconnect the account or refresh the source.");
        }
        return {
          kind: "http", url: parsedFileUrl.href, headers: { referer: `${MANYVIDS_WEB}/` },
          filename: authorizedFilename(videoId, parsedFileUrl, payload?.original?.filename ?? payload?.original?.file_name, item.filename),
        };
      }
      const response = await context.fetch(`https://www.manyvids.com/bff/store/video/${encodeURIComponent(videoId)}/private`, { signal: context.signal, headers: requestHeaders(cookie) });
      const payload = await response.json().catch(() => undefined) as { statusCode?: number; data?: { filepath?: unknown; transcodedFilepath?: unknown } } | undefined;
      const parsedFileUrl = authorizedFileUrl(payload?.data?.filepath) ?? authorizedFileUrl(payload?.data?.transcodedFilepath);
      if (!response.ok || payload?.statusCode !== 200 || !parsedFileUrl) {
        throw new Error("ManyVids did not authorize the full video for this session. Reconnect the account or confirm that the purchase is still accessible.");
      }
      return { kind: "http", url: parsedFileUrl.href, headers: { referer: `${MANYVIDS_WEB}/` }, filename: authorizedFilename(videoId, parsedFileUrl, undefined, item.filename) };
    }
    return ytDlpDownload(item, context.config, { referer: "https://www.manyvids.com/" });
  },
});
