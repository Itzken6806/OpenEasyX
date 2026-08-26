import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSubtitleContent, writeManualSubtitle } from "./subtitles";

describe("subtitle files", () => {
  it("converts SRT timestamps to WebVTT", () => {
    const result = normalizeSubtitleContent("1\r\n00:00:01,250 --> 00:00:03,500\r\nHello world\r\n");
    expect(result).toContain("WEBVTT\n\n");
    expect(result).toContain("00:00:01.250 --> 00:00:03.500");
  });

  it("stores a validated manual track in the persistent subtitle directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-subtitle-"));
    const result = writeManualSubtitle(root, "media123", "fr", "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour");
    expect(result.trackId).toBe("manual-fr");
    expect(fs.readFileSync(result.destination, "utf8")).toContain("Bonjour");
  });
});
