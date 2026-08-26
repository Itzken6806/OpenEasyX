import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import type { PluginContext } from "../../packages/plugin-sdk/index.js";

describe("Pornhub plugin", () => {
  it("lists profile videos through yt-dlp and returns a command download", async () => {
    const runCommand = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ entries: [{ id: "ph123", title: "Public clip", webpage_url: "https://www.pornhub.com/view_video.php?viewkey=ph123" }] }),
      stderr: "",
    }));
    const context: PluginContext = { config: {}, fetch, runCommand, log: () => undefined };
    const items = await plugin.listMedia!(context, { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.pornhub.com/pornstar/example", domain: "pornhub.com" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "pornhub:ph123", mediaType: "video", filename: "ph123.mp4" });
    expect(await plugin.resolveDownload!(context, items[0])).toMatchObject({ kind: "command", command: "yt-dlp", filename: "ph123.mp4" });
  });

  it("derives Pornhub video IDs from flat playlist URLs", async () => {
    const context: PluginContext = { config: {}, fetch, runCommand: async () => ({ exitCode: 0, stdout: JSON.stringify({ entries: [{ title: "Clip", url: "http://www.pornhub.com/view_video.php?viewkey=abc123" }] }), stderr: "" }), log: () => undefined };
    const items = await plugin.listMedia!(context, { id: "s", externalId: "s", performerId: "p", profileUrl: "https://www.pornhub.com/pornstar/example", domain: "pornhub.com" });
    expect(items[0]).toMatchObject({ externalId: "pornhub:abc123", pageUrl: "http://www.pornhub.com/view_video.php?viewkey=abc123" });
  });
});
