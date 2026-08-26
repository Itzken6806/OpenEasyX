import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";
import plugin from "./index.js";

describe("Eporner plugin", () => {
  it("extracts one supported video and resolves it through yt-dlp", async () => {
    const runCommand = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ id: "FJsA19J3Y3H", title: "Public video", webpage_url: "https://www.eporner.com/video-FJsA19J3Y3H/one-of-the-greats/", timestamp: 1_706_918_400, width: 1920, height: 1080 }),
      stderr: "",
    }));
    const context: PluginContext = { config: {}, fetch, runCommand, log: () => undefined };
    const source = { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.eporner.com/video-FJsA19J3Y3H/one-of-the-greats/", domain: "eporner.com" };

    const items = await plugin.listMedia!(context, source);

    expect(runCommand).toHaveBeenCalledWith("yt-dlp", expect.arrayContaining(["--dump-single-json", "--referer", "https://www.eporner.com/", source.profileUrl]), expect.any(Object));
    expect(items).toMatchObject([{ externalId: "eporner:FJsA19J3Y3H", identityKey: "eporner:FJsA19J3Y3H", mediaType: "video", filename: "FJsA19J3Y3H.mp4", publishedAt: "2024-02-03T00:00:00.000Z" }]);
    expect(await plugin.resolveDownload!(context, items[0])).toMatchObject({ kind: "command", command: "yt-dlp", filename: "FJsA19J3Y3H.mp4" });
  });

  it("advertises only yt-dlp-supported Eporner URLs and integrated cookies", () => {
    expect(plugin.manifest.sourceUrlPatterns).toEqual(expect.arrayContaining([
      "https://www.eporner.com/hd-porn/*", "https://www.eporner.com/embed/*", "https://www.eporner.com/video-*",
    ]));
    expect(plugin.manifest.sourceUrlPatterns).not.toContain("https://www.eporner.com/pornstar/*");
    expect(plugin.manifest.browserAuth).toEqual({ loginUrl: "https://www.eporner.com/login/", sessionSetting: "cookiesFile" });
    expect(plugin.manifest.settings).toContainEqual(expect.objectContaining({ key: "cookiesFile", type: "session", cookieDomains: ["eporner.com"] }));
  });
});
