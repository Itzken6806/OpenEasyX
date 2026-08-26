import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { definePlugin, type MediaCandidate, type PluginContext } from "../../packages/plugin-sdk/index.js";
import { positiveInteger } from "../yt-dlp-utils.js";

type OfScraperPayload = {
  username?: unknown;
  post_id?: unknown;
  media_id?: unknown;
  media?: Record<string, unknown>;
  post?: Record<string, unknown>;
  total_size?: unknown;
};

type OnlyFansAuth = { sess: string; auth_id: string; auth_uid: string; user_agent: string; "x-bc": string };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cookieValue(cookie: string | undefined, name: string): string | undefined {
  return cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1).trim() || undefined;
}

export function parseOnlyFansSession(contents: string): OnlyFansAuth {
  let parsed: Record<string, unknown>;
  try { parsed = record(JSON.parse(contents)); }
  catch { throw new Error("The OnlyFans session is not valid JSON"); }
  const auth = Object.keys(record(parsed.auth)).length ? record(parsed.auth) : parsed;
  const cookie = text(auth.cookie) ?? text(parsed.cookie);
  const result: OnlyFansAuth = {
    sess: text(auth.sess) ?? cookieValue(cookie, "sess") ?? "",
    auth_id: text(auth.auth_id) ?? cookieValue(cookie, "auth_id") ?? "",
    auth_uid: text(auth.auth_uid) ?? text(auth.auth_uid_) ?? cookieValue(cookie, "auth_uid_") ?? "",
    user_agent: text(auth.user_agent) ?? text(auth["user-agent"]) ?? text(parsed.user_agent) ?? text(parsed["user-agent"]) ?? "",
    "x-bc": text(auth["x-bc"]) ?? text(auth.x_bc) ?? text(parsed["x-bc"]) ?? text(parsed.x_bc) ?? "",
  };
  const missing = [["sess", result.sess], ["auth_id", result.auth_id], ["user_agent", result.user_agent], ["x-bc", result["x-bc"]]].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`The OnlyFans session is missing: ${missing.join(", ")}`);
  return result;
}

function usernameFromUrl(profileUrl: string): string {
  const url = new URL(profileUrl);
  if (!/(^|\.)onlyfans\.com$/i.test(url.hostname)) throw new Error("OnlyFans only supports onlyfans.com creator URLs");
  const username = url.pathname.split("/").filter(Boolean)[0];
  if (!username || !/^[\w.-]+$/.test(username)) throw new Error("The OnlyFans profile URL does not contain a valid username");
  return username;
}

function sessionPath(config: Record<string, unknown>): string {
  const configured = text(config.authSession);
  if (!configured) throw new Error("Import your OF-Scraper auth.json session before using this plugin");
  if (!fs.existsSync(configured)) throw new Error("The stored OnlyFans session could not be found. Import it again in Config.");
  return configured;
}

function ofScraperConfig(saveLocation: string) {
  return {
    main_profile: "main_profile",
    metadata: "{configpath}/{profile}/.data/{model_id}",
    discord: "",
    file_options: { save_location: saveLocation, dir_format: "{model_username}/{responsetype}/{mediatype}/", file_format: "{filename}.{ext}", textlength: 0, space_replacer: " ", date: "MM-DD-YYYY", text_type_default: "letter", truncation_default: true },
    download_options: { filter: ["Images", "Audios", "Videos"], auto_resume: true, system_free_min: 0, max_post_count: 0, verify_all_integrity: false },
    binary_options: { ffmpeg: "/usr/bin/ffmpeg" },
    cdm_options: { "private-key": null, "client-id": null, "key-mode-default": "cdrm" },
    performance_options: { download_sems: 2, download_limit: 0 },
    content_filter_options: { block_ads: true, file_size_max: 0, file_size_min: 0, length_max: 0, length_min: 0 },
    advanced_options: { "dynamic-mode-default": "digital", skip_unavailable_content: true, downloadbars: true, "cache-mode": "sqlite", rotate_logs: true, sanitize_text: false, temp_dir: null, remove_hash_match: null, infinite_loop_action_mode: false, incremental_downloads: true, default_user_list: "main", default_black_list: [], logs_expire_time: 0, ssl_verify: "custom", env_files: [] },
    script_options: { after_action_script: null, post_script: null, naming_script: null, after_download_script: null, skip_download_script: null },
    responsetype: { timeline: "Posts", message: "Messages", archived: "Archived", paid: "Messages", stories: "Stories", highlights: "Stories", profile: "Profile", pinned: "Posts", streams: "Streams" },
  };
}

export function prepareOnlyFansConfig(authFile: string, temporaryRoot: string): string {
  const configRoot = path.join(temporaryRoot, "ofscraper");
  const profileRoot = path.join(configRoot, "main_profile");
  fs.mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(profileRoot, "auth.json"), `${JSON.stringify(parseOnlyFansSession(fs.readFileSync(authFile, "utf8")), null, 2)}\n`, { mode: 0o600 });
  const configFile = path.join(configRoot, "config.json");
  fs.writeFileSync(configFile, `${JSON.stringify(ofScraperConfig(path.join(temporaryRoot, "downloads")), null, 2)}\n`, { mode: 0o600 });
  return configFile;
}

function baseArgs(configFile: string, username: string): string[] {
  return ["--config", configFile, "--profile", "main_profile", "--output", "low", "--no-live", "--auth-quit", "--username", username];
}

function mediaType(payload: OfScraperPayload): MediaCandidate["mediaType"] {
  const kind = text(payload.media?.type)?.toLowerCase();
  if (kind === "photo" || kind === "image") return "image";
  if (kind === "video" || kind === "gif") return "video";
  return "other";
}

function plainText(value: unknown): string | undefined {
  const valueText = text(value);
  return valueText?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

export function onlyFansCandidates(payloads: OfScraperPayload[], fallbackUsername: string): MediaCandidate[] {
  const candidates = new Map<string, MediaCandidate>();
  for (const payload of payloads) {
    const mediaId = String(payload.media_id ?? payload.media?.id ?? "").trim();
    if (!mediaId) continue;
    const username = text(payload.username) ?? fallbackUsername;
    const postId = String(payload.post_id ?? payload.post?.id ?? "").trim();
    const type = mediaType(payload);
    const extension = type === "image" ? "jpg" : type === "video" ? "mp4" : "bin";
    const createdAt = text(payload.media?.createdAt) ?? text(payload.media?.created_at)
      ?? text(payload.media?.postedAt) ?? text(payload.media?.posted_at)
      ?? text(payload.post?.postedAt) ?? text(payload.post?.posted_at)
      ?? text(payload.post?.createdAt) ?? text(payload.post?.created_at);
    const expectedBytes = Number(payload.total_size);
    candidates.set(mediaId, {
      externalId: `onlyfans:${mediaId}`,
      identityKey: `onlyfans:${mediaId}`,
      title: plainText(payload.post?.text) ?? `${username} media ${mediaId}`,
      pageUrl: postId ? `https://onlyfans.com/${postId}/${username}` : `https://onlyfans.com/${username}`,
      mediaType: type,
      publishedAt: createdAt && !Number.isNaN(new Date(createdAt).valueOf()) ? new Date(createdAt).toISOString() : undefined,
      filename: `${mediaId}.${extension}`,
      expectedBytes: Number.isFinite(expectedBytes) && expectedBytes > 0 ? expectedBytes : undefined,
      metadata: { ofscraperUsername: username, ofscraperMediaId: mediaId },
    });
  }
  return [...candidates.values()];
}

async function testOfScraper(context: PluginContext): Promise<{ ok: boolean; message: string }> {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-of-auth-test-"));
  try {
    const configFile = prepareOnlyFansConfig(sessionPath(context.config), temporaryRoot);
    const result = await context.runCommand("easyx-ofscraper-auth-test", [configFile], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
    return result.exitCode === 0
      ? { ok: true, message: (result.stdout || result.stderr).trim() || "OnlyFans accepted the imported session." }
      : { ok: false, message: (result.stderr || result.stdout).trim() || "OnlyFans could not verify the imported session. Import a fresh auth.json and try again." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export default definePlugin({
  manifest: {
    id: "org.easyx.onlyfans",
    name: "OnlyFans",
    version: "3.0.3",
    author: "Open EasyX",
    homepage: "https://github.com/datawhores/OF-Scraper",
    description: "Connect in the integrated EasyX browser, then list and download OnlyFans media already authorized for your account. Paywalls and DRM authorization are never bypassed.",
    capabilities: ["media-listing", "download-resolver"],
    sourceUrlPatterns: ["http://onlyfans.com/*", "https://onlyfans.com/*", "http://www.onlyfans.com/*", "https://www.onlyfans.com/*"],
    polling: { mode: "periodic", defaultIntervalSeconds: 3600, minimumIntervalSeconds: 900 },
    browserAuth: { loginUrl: "https://onlyfans.com/", sessionSetting: "authSession", capture: "onlyfans" },
    settings: [
      { key: "authSession", label: "OnlyFans session", type: "session", sessionFormat: "raw-json", required: true, placeholder: "Manual fallback: paste or import your OF-Scraper auth.json", help: "Recommended: sign in with the integrated EasyX browser above. Manual auth.json import remains available as a fallback." },
      { key: "maxItems", label: "Maximum media per scan", type: "number", default: 100 },
    ],
  },
  async testConnection(context) { return testOfScraper(context); },
  async listMedia(context, source) {
    const username = usernameFromUrl(source.profileUrl);
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-of-list-"));
    try {
      const outputPath = path.join(temporaryRoot, "media.jsonl");
      const scriptPath = path.join(temporaryRoot, "capture-media.mjs");
      fs.writeFileSync(scriptPath, `#!/usr/bin/env node\nimport fs from "node:fs";\nlet input="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{fs.appendFileSync(${JSON.stringify(outputPath)},input.replace(/\\n/g," ")+"\\n");process.stdout.write("false");});\n`, { mode: 0o700 });
      const configFile = prepareOnlyFansConfig(sessionPath(context.config), temporaryRoot);
      const maxItems = positiveInteger(context.config.maxItems, 100, 500);
      const result = await context.runCommand("ofscraper", [
        ...baseArgs(configFile, username), "--no-cache", "--force-all", "--posts", "all",
        "--action", "download", "--max-media-count", String(maxItems), "--skip-download-script", scriptPath,
      ], { timeoutMs: 15 * 60_000, maxOutputBytes: 25 * 1024 * 1024 });
      if (result.exitCode !== 0) throw new Error((result.stderr || result.stdout).trim() || `OF-Scraper exited with code ${result.exitCode}`);
      const payloads = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as OfScraperPayload) : [];
      return onlyFansCandidates(payloads, username).slice(0, maxItems);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
  async resolveDownload(context, item) {
    const username = text(item.metadata?.ofscraperUsername);
    const mediaId = text(item.metadata?.ofscraperMediaId);
    const postUrl = text(item.pageUrl);
    if (!username || !mediaId || !postUrl) throw new Error("OF-Scraper media metadata is incomplete");
    return {
      kind: "command",
      command: "easyx-ofscraper-download",
      args: [sessionPath(context.config), postUrl, mediaId, String(item.expectedBytes ?? 0), "{output}"],
      filename: item.filename ?? `${mediaId}.bin`,
    };
  },
});
