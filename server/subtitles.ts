import fs from "node:fs";
import path from "node:path";

export const SUBTITLE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
] as const;

export const subtitleLanguageCodes = new Set<string>(SUBTITLE_LANGUAGES.map((item) => item.code));

export function subtitleLanguageLabel(code: string) {
  return SUBTITLE_LANGUAGES.find((item) => item.code === code)?.label ?? code.toUpperCase();
}

export function normalizeSubtitleContent(content: string) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("Subtitle file is empty");
  if (normalized.startsWith("WEBVTT")) return `${normalized}\n`;
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2 --> $3.$4");
  if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(converted)) {
    throw new Error("Only WebVTT and SRT subtitle files are supported");
  }
  return `WEBVTT\n\n${converted}\n`;
}

export function subtitleFilePath(dataDir: string, mediaId: string, trackId: string) {
  if (!/^[a-z0-9-]+$/i.test(mediaId) || !/^[a-z0-9-]+$/i.test(trackId)) throw new Error("Invalid subtitle path");
  return path.join(dataDir, "subtitles", mediaId, `${trackId}.vtt`);
}

export function writeManualSubtitle(dataDir: string, mediaId: string, language: string, content: string) {
  if (!subtitleLanguageCodes.has(language)) throw new Error("Unsupported subtitle language");
  const trackId = `manual-${language}`;
  const destination = subtitleFilePath(dataDir, mediaId, trackId);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, normalizeSubtitleContent(content), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, destination);
  return { trackId, destination };
}
