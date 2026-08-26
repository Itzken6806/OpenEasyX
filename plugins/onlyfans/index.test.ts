import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import plugin, { onlyFansCandidates, parseOnlyFansSession, prepareOnlyFansConfig } from "./index.js";

const temporaryDirectories: string[] = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("OnlyFans plugin", () => {
  it("turns OF-Scraper media payloads into individually queueable candidates", () => {
    expect(onlyFansCandidates([{
      username: "creator", post_id: "123", media_id: "456", total_size: 1200,
      media: { id: 456, type: "photo", createdAt: "2026-08-20T10:00:00Z" },
      post: { id: 123, text: "<p>New photo</p>" },
    }], "fallback")).toMatchObject([{
      externalId: "onlyfans:456", title: "New photo", pageUrl: "https://onlyfans.com/123/creator",
      mediaType: "image", filename: "456.jpg", expectedBytes: 1200, publishedAt: "2026-08-20T10:00:00.000Z",
    }]);
  });

  it("recognizes snake-case source publication dates", () => {
    const items = onlyFansCandidates([{ media_id: "456", media: { type: "video" }, post: { posted_at: "2024-02-03T10:20:30Z" } }], "creator");
    expect(items[0].publishedAt).toBe("2024-02-03T10:20:30.000Z");
  });

  it("accepts a native OF-Scraper auth.json", () => {
    expect(parseOnlyFansSession(JSON.stringify({
      sess: "session-value", auth_id: "123", auth_uid: "456",
      user_agent: "Mozilla/5.0", "x-bc": "xbc-value",
    }))).toEqual({
      sess: "session-value", auth_id: "123", auth_uid: "456",
      user_agent: "Mozilla/5.0", "x-bc": "xbc-value",
    });
  });

  it("accepts a compatible Cookie Helper export", () => {
    expect(parseOnlyFansSession(JSON.stringify({ auth: {
      cookie: "auth_id=123; sess=session-value; auth_uid_=456",
      "user-agent": "Mozilla/5.0", "x-bc": "xbc-value",
    } }))).toEqual({
      sess: "session-value", auth_id: "123", auth_uid: "456",
      user_agent: "Mozilla/5.0", "x-bc": "xbc-value",
    });
  });

  it("rejects incomplete sessions before OF-Scraper is started", () => {
    expect(() => parseOnlyFansSession("not json")).toThrow("not valid JSON");
    expect(() => parseOnlyFansSession(JSON.stringify({ sess: "value" }))).toThrow("auth_id, user_agent, x-bc");
  });

  it("creates a private, self-contained OF-Scraper profile", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-onlyfans-test-")); temporaryDirectories.push(root);
    const authFile = path.join(root, "imported.json");
    fs.writeFileSync(authFile, JSON.stringify({ sess: "session", auth_id: "123", user_agent: "Mozilla/5.0", "x-bc": "xbc" }));
    const configFile = prepareOnlyFansConfig(authFile, path.join(root, "run"));
    const generatedAuth = path.join(path.dirname(configFile), "main_profile", "auth.json");
    expect(JSON.parse(fs.readFileSync(generatedAuth, "utf8"))).toEqual({ sess: "session", auth_id: "123", auth_uid: "", user_agent: "Mozilla/5.0", "x-bc": "xbc" });
    expect(JSON.parse(fs.readFileSync(configFile, "utf8"))).toMatchObject({ main_profile: "main_profile", binary_options: { ffmpeg: "/usr/bin/ffmpeg" }, advanced_options: { downloadbars: true } });
    expect(fs.statSync(generatedAuth).mode & 0o777).toBe(0o600);
    expect(fs.statSync(configFile).mode & 0o777).toBe(0o600);
  });

  it("exposes a raw JSON session import and passes it to the download wrapper", async () => {
    expect(plugin.manifest.settings).toContainEqual(expect.objectContaining({ key: "authSession", type: "session", sessionFormat: "raw-json", required: true }));
    expect(plugin.manifest.browserAuth).toEqual({ loginUrl: "https://onlyfans.com/", sessionSetting: "authSession", capture: "onlyfans" });
    expect(plugin.manifest.settings?.some((field) => field.key === "configPath" || field.key === "profile")).toBe(false);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-onlyfans-resolve-")); temporaryDirectories.push(root);
    const authFile = path.join(root, "auth.json"); fs.writeFileSync(authFile, "{}");
    const result = await plugin.resolveDownload?.({ config: { authSession: authFile }, fetch, runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }), log() {} }, {
      externalId: "onlyfans:456", title: "Media", pageUrl: "https://onlyfans.com/123/creator", mediaType: "video", expectedBytes: 1200, metadata: { ofscraperUsername: "creator", ofscraperMediaId: "456" },
    });
    expect(result).toMatchObject({ command: "easyx-ofscraper-download", args: [authFile, "https://onlyfans.com/123/creator", "456", "1200", "{output}"] });
  });

  it("uses a real, read-only OF-Scraper authentication check", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-onlyfans-connection-")); temporaryDirectories.push(root);
    const authFile = path.join(root, "auth.json");
    fs.writeFileSync(authFile, JSON.stringify({ sess: "session", auth_id: "123", user_agent: "Mozilla/5.0", "x-bc": "xbc" }));
    let invocation: { command: string; args: string[] } | undefined;
    const result = await plugin.testConnection?.({
      config: { authSession: authFile }, fetch,
      runCommand: async (command, args) => { invocation = { command, args }; return { exitCode: 0, stdout: "OnlyFans authentication succeeded with OF-Scraper 3.14.7.\n", stderr: "" }; },
      log() {},
    });
    expect(result).toEqual({ ok: true, message: "OnlyFans authentication succeeded with OF-Scraper 3.14.7." });
    expect(invocation?.command).toBe("easyx-ofscraper-auth-test");
    expect(invocation?.args).toHaveLength(1);
    expect(invocation?.args[0]).toMatch(/ofscraper\/config\.json$/);
    expect(fs.existsSync(invocation?.args[0] ?? "")).toBe(false);
  });
});
