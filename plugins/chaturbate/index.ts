import { createHash } from "node:crypto";
import { definePlugin, type LiveCam, type LiveCamPage, type MediaCandidate } from "../../packages/plugin-sdk/index.js";
import { configuredArgs, runYtDlpJson, testYtDlp, ytDlpDownload, ytDlpLiveStream } from "../yt-dlp-utils.js";

const OFFLINE = ["offline", "not currently broadcasting", "room is currently away", "no videos found", "not live"];
let liveSearchCache: { key: string; expiresAt: number; cams: LiveCam[] } | undefined;

function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function stamp(value: unknown): number | undefined { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }

export function normalizedChaturbateUrl(value: string): string {
  const url = new URL(value);
  const room = url.pathname.split("/").filter(Boolean)[0];
  if (room) url.pathname = `/${room.toLowerCase()}/`;
  return url.toString();
}

function stableStreamKey(value: string): string {
  try {
    const url = new URL(value);
    const stream = url.pathname.match(/\/streams\/([^/]+)/)?.[1];
    return stream ?? `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function whole(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function tags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,#]+/) : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function chaturbateLiveCam(room: unknown): LiveCam | undefined {
  if (!room || typeof room !== "object" || Array.isArray(room)) return undefined;
  const value = room as Record<string, unknown>;
  const username = text(value.username) ?? text(value.room) ?? text(value.slug);
  if (!username || !/^[a-z0-9_]+$/i.test(username)) return undefined;
  const status = (text(value.current_show) ?? text(value.room_status) ?? text(value.label) ?? "public").toLowerCase();
  if (status !== "public") return undefined;
  let thumbnailUrl = text(value.img) ?? text(value.thumbnail) ?? text(value.thumbnail_url);
  if (thumbnailUrl?.startsWith("//")) thumbnailUrl = `https:${thumbnailUrl}`;
  const age = whole(value.age ?? value.display_age);
  return {
    id: username.toLowerCase(), username,
    title: text(value.room_subject) ?? text(value.subject) ?? username,
    pageUrl: `https://chaturbate.com/${username}/`,
    thumbnailUrl: thumbnailUrl ?? `https://roomimg.stream.highwebmedia.com/ri/${encodeURIComponent(username)}.jpg`,
    viewers: whole(value.num_users ?? value.viewers ?? value.num_viewers) ?? 0,
    age: age !== undefined && age >= 18 && age <= 80 ? age : undefined, gender: text(value.gender), tags: tags(value.tags),
  };
}

export function chaturbateLiveCamPage(payload: unknown, page: number, pageSize: number): LiveCamPage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Chaturbate returned an invalid live room list");
  const value = payload as Record<string, unknown>; let rooms: unknown = value.rooms;
  if (rooms && typeof rooms === "object" && !Array.isArray(rooms)) {
    const nested = rooms as Record<string, unknown>;
    rooms = nested.rooms ?? nested.results ?? nested.items ?? Object.values(nested);
  }
  if (!Array.isArray(rooms)) throw new Error("Chaturbate returned an invalid live room list");
  const cams = rooms.map(chaturbateLiveCam).filter((cam): cam is LiveCam => Boolean(cam));
  const total = whole(value.total_count ?? value.totalCount ?? value.num_total ?? value.numTotal ?? value.total) ?? cams.length;
  return { cams, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function chaturbateLiveCandidate(info: Record<string, unknown>, profileUrl: string): MediaCandidate | undefined {
  const liveStatus = text(info.live_status)?.toLowerCase();
  if (info.is_live !== true && liveStatus !== "is_live") return undefined;
  const id = text(info.id) ?? new URL(profileUrl).pathname.split("/").filter(Boolean)[0] ?? "live";
  const started = stamp(info.release_timestamp) ?? stamp(info.timestamp);
  const formats = Array.isArray(info.formats) ? info.formats as Array<Record<string, unknown>> : [];
  const streamKey = stableStreamKey(formats.map((format) => text(format.url)).find(Boolean) ?? `${id}:${started ?? "current"}`);
  const session = started ? String(started) : createHash("sha256").update(streamKey).digest("hex").slice(0, 16);
  return {
    externalId: `chaturbate:${id}:${session}`,
    title: text(info.title) ?? `${id} live`,
    pageUrl: profileUrl,
    mediaType: "video",
    publishedAt: started ? new Date(started * 1000).toISOString() : undefined,
    filename: `${id}-${session}.mp4`,
    metadata: { extractorUrl: profileUrl, live: true },
  };
}

export default definePlugin({
  manifest: {
    id: "org.easyx.chaturbate",
    name: "Chaturbate Live",
    version: "1.0.0",
    author: "Open EasyX",
    homepage: "https://github.com/yt-dlp/yt-dlp",
    description: "Check a public Chaturbate room and record a live session with yt-dlp and FFmpeg only when the room is broadcasting.",
    capabilities: ["media-listing", "download-resolver", "live-cam"],
    sourceUrlPatterns: ["http://chaturbate.com/*", "https://chaturbate.com/*", "http://www.chaturbate.com/*", "https://www.chaturbate.com/*"],
    polling: { mode: "live", defaultIntervalSeconds: 10, minimumIntervalSeconds: 5 },
    browserAuth: { loginUrl: "https://chaturbate.com/auth/login/", sessionSetting: "cookiesFile" },
    settings: [
      { key: "cookiesFile", label: "Account session", type: "session", cookieDomains: ["chaturbate.com"], help: "Optional. Public rooms normally do not require an account session." },
    ],
  },
  async testConnection(context) { return testYtDlp(context, "Chaturbate"); },
  async listMedia(context, source) {
    try {
      const profileUrl = normalizedChaturbateUrl(source.profileUrl);
      const info = await runYtDlpJson(context, ["--skip-download", "--dump-single-json", "--socket-timeout", "20", "--referer", "https://chaturbate.com/", ...configuredArgs(context.config), profileUrl], 90_000);
      const candidate = chaturbateLiveCandidate(info, profileUrl);
      return candidate ? [candidate] : [];
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (OFFLINE.some((marker) => message.includes(marker))) return [];
      throw error;
    }
  },
  async listLiveCams(context, query) {
    const load = async (offset: number, limit: number) => {
      const params = new URLSearchParams({ limit: String(Math.min(100, limit)), offset: String(offset) });
      if (query.gender) params.set("genders", { female: "f", male: "m", couple: "c", trans: "t" }[query.gender]);
      if (query.search) params.set("keywords", query.search);
      const response = await context.fetch(`https://chaturbate.com/api/ts/roomlist/room-list/?${params}`, {
        headers: {
          accept: "application/json", "x-requested-with": "XMLHttpRequest", referer: "https://chaturbate.com/",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136.0 Safari/537.36",
        }, signal: context.signal ?? AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Chaturbate live rooms returned HTTP ${response.status}`);
      const page = chaturbateLiveCamPage(await response.json(), 1, limit);
      return { ...page, cams: page.cams.slice(0, limit) };
    };

    if (query.search) {
      const cacheKey = `${query.gender ?? ""}:${query.search.toLowerCase()}`;
      let matching = liveSearchCache?.key === cacheKey && liveSearchCache.expiresAt > Date.now() ? liveSearchCache.cams : undefined;
      if (!matching) {
        const first = await load(0, 100);
        const offsets = Array.from({ length: Math.max(0, Math.ceil(first.total / 100) - 1) }, (_, index) => (index + 1) * 100);
        const rest = await Promise.all(offsets.map((offset) => load(offset, 100)));
        const unique = new Map<string, LiveCam>();
        for (const cam of [first, ...rest].flatMap((page) => page.cams)) unique.set(cam.id, cam);
        const needle = query.search.toLowerCase();
        matching = [...unique.values()].filter((cam) => `${cam.username} ${cam.title ?? ""} ${(cam.tags ?? []).join(" ")}`.toLowerCase().includes(needle));
        liveSearchCache = { key: cacheKey, expiresAt: Date.now() + 10_000, cams: matching };
      }
      const start = (query.page - 1) * query.pageSize;
      return { cams: matching.slice(start, start + query.pageSize), total: matching.length, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(matching.length / query.pageSize)) };
    }

    const start = (query.page - 1) * query.pageSize; const end = start + query.pageSize;
    const base = Math.floor(start / 100) * 100;
    const offsets = Array.from({ length: Math.ceil((end - base) / 100) }, (_, index) => base + index * 100);
    const pages = await Promise.all(offsets.map((offset) => load(offset, Math.min(100, end - offset))));
    const cams = pages.flatMap((page) => page.cams).slice(start - base, end - base);
    const total = pages[0]?.total ?? cams.length;
    return { cams, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
  },
  async resolveLiveStream(context, cam) { return ytDlpLiveStream(context, cam, { referer: "https://chaturbate.com/" }); },
  async resolveDownload(context, item) { return ytDlpDownload(item, context.config, { referer: "https://chaturbate.com/", live: true }); },
});
