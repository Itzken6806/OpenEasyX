#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const [authFile, postUrl, mediaId, expectedBytesValue, outputPath] = process.argv.slice(2);
if (!authFile || !postUrl || !mediaId || !outputPath) {
  console.error("Usage: easyx-ofscraper-download <auth-json> <post-url> <media-id> <expected-bytes> <output>");
  process.exit(2);
}
const expectedBytes = Math.max(0, Number(expectedBytesValue) || 0);
const preparationShare = 20;

function text(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function cookieValue(cookie, name) { return cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1).trim() || undefined; }
function parseAuth(contents) {
  const parsed = record(JSON.parse(contents));
  const auth = Object.keys(record(parsed.auth)).length ? record(parsed.auth) : parsed;
  const cookie = text(auth.cookie) ?? text(parsed.cookie);
  const normalized = {
    sess: text(auth.sess) ?? cookieValue(cookie, "sess") ?? "",
    auth_id: text(auth.auth_id) ?? cookieValue(cookie, "auth_id") ?? "",
    auth_uid: text(auth.auth_uid) ?? text(auth.auth_uid_) ?? cookieValue(cookie, "auth_uid_") ?? "",
    user_agent: text(auth.user_agent) ?? text(auth["user-agent"]) ?? text(parsed.user_agent) ?? text(parsed["user-agent"]) ?? "",
    "x-bc": text(auth["x-bc"]) ?? text(auth.x_bc) ?? text(parsed["x-bc"]) ?? text(parsed.x_bc) ?? "",
  };
  if (!normalized.sess || !normalized.auth_id || !normalized.user_agent || !normalized["x-bc"]) throw new Error("The imported OnlyFans session is incomplete");
  return normalized;
}

function config(saveLocation) {
  return {
    main_profile: "main_profile", metadata: "{configpath}/{profile}/.data/{model_id}", discord: "",
    file_options: { save_location: saveLocation, dir_format: "{model_username}/{responsetype}/{mediatype}/", file_format: "{filename}.{ext}", textlength: 0, space_replacer: " ", date: "MM-DD-YYYY", text_type_default: "letter", truncation_default: true },
    download_options: { filter: ["Images", "Audios", "Videos"], auto_resume: true, system_free_min: 0, max_post_count: 0, verify_all_integrity: false },
    binary_options: { ffmpeg: "/usr/bin/ffmpeg" }, cdm_options: { "private-key": null, "client-id": null, "key-mode-default": "cdrm" },
    performance_options: { download_sems: 1, download_limit: 0 }, content_filter_options: { block_ads: true, file_size_max: 0, file_size_min: 0, length_max: 0, length_min: 0 },
    advanced_options: { "dynamic-mode-default": "digital", skip_unavailable_content: true, downloadbars: true, "cache-mode": "sqlite", rotate_logs: true, sanitize_text: false, temp_dir: null, remove_hash_match: null, infinite_loop_action_mode: false, incremental_downloads: true, default_user_list: "main", default_black_list: [], logs_expire_time: 0, ssl_verify: "custom", env_files: [] },
    script_options: { after_action_script: null, post_script: null, naming_script: null, after_download_script: null, skip_download_script: null },
    responsetype: { timeline: "Posts", message: "Messages", archived: "Archived", paid: "Messages", stories: "Stories", highlights: "Stories", profile: "Profile", pinned: "Posts", streams: "Streams" },
  };
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-of-download-"));
let progressTimer;
function directoryBytes(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return total + directoryBytes(target);
      if (!entry.isFile()) return total;
      try { return total + fs.statSync(target).size; } catch { return total; }
    }, 0);
  } catch { return 0; }
}
try {
  const configRoot = path.join(temporaryRoot, "ofscraper");
  const profileRoot = path.join(configRoot, "main_profile");
  fs.mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(profileRoot, "auth.json"), `${JSON.stringify(parseAuth(fs.readFileSync(authFile, "utf8")), null, 2)}\n`, { mode: 0o600 });
  const configFile = path.join(configRoot, "config.json");
  fs.writeFileSync(configFile, `${JSON.stringify(config(path.join(temporaryRoot, "downloads")), null, 2)}\n`, { mode: 0o600 });
  const namingScript = path.join(temporaryRoot, "name-media.mjs");
  fs.writeFileSync(namingScript, `#!/usr/bin/env node\nlet input="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{const p=JSON.parse(input);const f=String(p.file||"");if(!f.endsWith(".part")&&!/^(?:temp|audio|video)_/i.test(f))process.stdout.write(${JSON.stringify(outputPath)});});\n`, { mode: 0o700 });
  const args = [
    "manual", "--config", configFile, "--profile", "main_profile", "--output", "normal", "--no-live", "--auth-quit",
    "--url", postUrl, "--media-id", mediaId, "--force-all", "--naming-script", namingScript,
  ];
  const downloadsRoot = path.join(temporaryRoot, "downloads");
  process.stderr.write("easyx-stage:Preparing OnlyFans extractor\n");
  process.stderr.write("easyx-progress:1%\n");
  const child = spawn("ofscraper", args, { stdio: ["inherit", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  let lastBytes = -1;
  let lastProgress = 1;
  const startedAt = Date.now();
  progressTimer = setInterval(() => {
    const downloadedBytes = directoryBytes(downloadsRoot);
    if (downloadedBytes > 0) {
      if (downloadedBytes === lastBytes) return;
      lastBytes = downloadedBytes;
      const ratio = expectedBytes > 0 ? Math.min(1, downloadedBytes / expectedBytes) : 0;
      const progress = expectedBytes > 0 ? Math.min(99, preparationShare + ratio * (99 - preparationShare)) : preparationShare;
      lastProgress = Math.max(lastProgress, progress);
      process.stderr.write(`easyx-progress:${lastProgress.toFixed(1)}%\n`);
      process.stderr.write(`easyx-bytes:${downloadedBytes}:${expectedBytes}\n`);
      return;
    }
    const preparationProgress = Math.min(preparationShare, 1 + Math.floor((Date.now() - startedAt) / 10_000));
    if (preparationProgress <= lastProgress) return;
    lastProgress = preparationProgress;
    process.stderr.write(`easyx-progress:${preparationProgress}%\n`);
  }, 500);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal }));
  });
  if (result.signal) throw new Error(`ofscraper stopped with signal ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  if (progressTimer) clearInterval(progressTimer);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
