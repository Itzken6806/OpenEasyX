import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { browserHtml, decodeHtml, plainHtml } from "../browser-html-utils.js";
import { directCandidate, downloadRequest, extractHtmlMedia, filterMedia, htmlPublishedDate, mediaFilters } from "../media-utils.js";

function mediaExtension(url: string, fallback: string): string {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const extension = name.includes(".") ? name.split(".").at(-1)?.toLowerCase() : undefined;
    return extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : fallback;
  } catch { return fallback; }
}

function decodeEscapedUrl(value: string): string | undefined {
  const decoded = decodeHtml(value
    .replace(/\\+\//g, "/")
    .replace(/\\+u([0-9a-f]{4})/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\+$/g, ""));
  try {
    const url = new URL(decoded);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function escapedValues(html: string, key: string): string[] {
  const pattern = new RegExp(`(?:(?:\\\\")|")${key}(?:(?:\\\\")|")\\s*:\\s*(?:(?:\\\\")|")([^"]+)`, "g");
  return [...html.matchAll(pattern)].flatMap((match) => {
    const url = decodeEscapedUrl(match[1]);
    return url ? [url] : [];
  });
}

function postIdentity(pageUrl: string): string {
  const match = new URL(pageUrl).pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Instagram post URL does not contain a shortcode");
  return match[1];
}

function postTitle(html: string, fallback: string): string {
  const image = (html.match(/<img\b[^>]*\bclass=(?:"[^"]*EmbeddedMediaImage[^"]*"|'[^']*EmbeddedMediaImage[^']*')[^>]*>/i) ?? [])[0];
  const alt = image?.match(/\balt=(?:"([^"]*)"|'([^']*)')/i);
  return plainHtml(alt?.[1] ?? alt?.[2] ?? "") || fallback;
}

export function instagramPostUrls(html: string, baseUrl = "https://www.instagram.com/"): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/(p|reel)\/([A-Za-z0-9_-]+)/g)) {
    found.add(new URL(`/${match[1]}/${match[2]}/`, baseUrl).href);
  }
  return [...found];
}

export function extractInstagramEmbed(html: string, pageUrl: string): MediaCandidate[] {
  const shortcode = postIdentity(pageUrl);
  const title = postTitle(html, `Instagram post ${shortcode}`);
  const publishedAt = htmlPublishedDate(html);
  const videoUrls = [...new Set(escapedValues(html, "video_url"))];
  const displayUrls = [...new Set(escapedValues(html, "display_url"))];
  const embeddedTags = (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => /\bclass=(?:"[^"]*EmbeddedMediaImage[^"]*"|'[^']*EmbeddedMediaImage[^']*')/i.test(tag));
  const embeddedImages = embeddedTags.flatMap((tag) => extractHtmlMedia(tag, pageUrl, pageUrl, 10)).filter((item) => item.mediaType === "image");
  const imageUrls = displayUrls.length > 1 ? displayUrls : videoUrls.length ? [] : embeddedImages.map((item) => item.externalId);
  const candidates: MediaCandidate[] = [];
  imageUrls.forEach((url, index) => {
    const identity = `instagram:${shortcode}:image:${index + 1}`;
    const item = directCandidate(url, { hint: "image", title, pageUrl, publishedAt });
    candidates.push({ ...item, externalId: identity, identityKey: identity, filename: `${shortcode}-${index + 1}.${mediaExtension(url, "jpg")}` });
  });
  videoUrls.forEach((url, index) => {
    const identity = `instagram:${shortcode}:video:${index + 1}`;
    const item = directCandidate(url, { hint: "video", title, pageUrl, publishedAt });
    candidates.push({ ...item, externalId: identity, identityKey: identity, filename: `${shortcode}-${index + 1}.${mediaExtension(url, "mp4")}` });
  });
  return candidates;
}

function normalizedPostUrl(rawUrl: string): string | undefined {
  const url = new URL(rawUrl);
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("Instagram scraper only accepts instagram.com URLs");
  const match = url.pathname.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
  return match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : undefined;
}

async function instagramPost(context: PluginContext, pageUrl: string): Promise<MediaCandidate[]> {
  const embedUrl = `${pageUrl.replace(/\/+$/, "")}/embed/captioned/`;
  return extractInstagramEmbed(await browserHtml(context, embedUrl), pageUrl);
}

async function batched<T, R>(values: T[], size: number, operation: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += size) results.push(...await Promise.all(values.slice(index, index + size).map(operation)));
  return results;
}

async function publicInstagramMedia(context: PluginContext, sourceUrl: string, maxItems: number): Promise<MediaCandidate[]> {
  const directPost = normalizedPostUrl(sourceUrl);
  if (directPost) return instagramPost(context, directPost);
  const profileUrl = new URL(sourceUrl); profileUrl.search = ""; profileUrl.hash = "";
  const html = await browserHtml(context, profileUrl.href);
  const posts = instagramPostUrls(html, profileUrl.href).slice(0, maxItems);
  if (!posts.length) throw new Error("Instagram returned no public post links for this profile");
  const settled = await batched(posts, 4, async (post) => {
    try { return await instagramPost(context, post); }
    catch (error) {
      context.log("warn", `Instagram public embed failed for ${post}`, error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const items = settled.flat();
  if (!items.length) throw new Error("Instagram public embeds returned no downloadable photos or videos");
  return items.slice(0, maxItems);
}

export default definePlugin({
  manifest: {
    id: "org.easyx.instagram",
    name: "Instagram",
    version: "2.0.0",
    author: "Open EasyX",
    homepage: "https://www.instagram.com/",
    description: "List and download photos, carousels, and reels from public Instagram pages and embeds without an account or API key.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://instagram.com/*", "https://instagram.com/*", "http://www.instagram.com/*", "https://www.instagram.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 300 },
    settings: [
      { key: "maxItems", label: "Maximum media per scan", type: "number", default: 30 },
      { key: "includeImages", label: "Include images", type: "boolean", default: true },
      { key: "includeVideos", label: "Include videos", type: "boolean", default: true },
    ],
  },
  async testConnection(context) {
    try {
      await browserHtml(context, "https://www.instagram.com/");
      return { ok: true, message: "Public Instagram page extraction is ready (no account or API key required)." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
  async listMedia(context, source) {
    const { maxItems } = mediaFilters(context.config);
    return filterMedia(await publicInstagramMedia(context, source.profileUrl, maxItems), context.config);
  },
  async resolveDownload(context, item) {
    if (!item.pageUrl) return downloadRequest(item);
    const refreshed = await instagramPost(context, item.pageUrl);
    return downloadRequest(refreshed.find((candidate) => candidate.identityKey === item.identityKey) ?? item);
  },
});
