import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";
import plugin, { publicTikTokMedia } from "./index.js";

describe("public TikTok plugin", () => {
  it("falls back from a blocked profile to anonymous post discovery and extracts photos", async () => {
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === "yt-dlp") return {
        exitCode: 0,
        stdout: JSON.stringify({ entries: [{ id: "123", url: "https://www.tiktok.com/@example/video/123", title: "Photo post" }] }),
        stderr: "",
      };
      if (args.at(-1)?.includes("/video/123")) return {
        exitCode: 0,
        stdout: JSON.stringify([[3, "https://p16-sign.tiktokcdn.com/photo.jpg", { id: "123", post_id: "123", filename: "123_01", extension: "jpg", type: "image", username: "example" }]]),
        stderr: "",
      };
      return { exitCode: 0, stdout: JSON.stringify([[-1, { error: "HttpError", message: "profile blocked" }]]), stderr: "" };
    });
    const context: PluginContext = { config: { maxItems: 5 }, fetch, log: vi.fn(), runCommand };
    const items = await publicTikTokMedia(context, "https://www.tiktok.com/@example", 5);
    expect(items).toMatchObject([{ externalId: "tiktok:123:123_01.jpg", mediaType: "image", filename: "123_01.jpg" }]);
    const galleryCalls = runCommand.mock.calls.filter(([command]) => command === "gallery-dl");
    expect(galleryCalls.every(([, args]) => args.includes("extractor.tiktok.browser=chrome"))).toBe(true);
    expect(galleryCalls.every(([, args]) => !args.includes("--cookies"))).toBe(true);
    expect(runCommand.mock.calls.find(([command]) => command === "yt-dlp")?.[1]).toContain("--impersonate");
  });

  it("requires no TikTok session", () => {
    expect(plugin.manifest.browserAuth).toBeUndefined();
    expect(plugin.manifest.settings?.some((field) => field.type === "session")).toBe(false);
  });
});
