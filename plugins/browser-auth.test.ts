import { describe, expect, it } from "vitest";
import chaturbate from "./chaturbate/index.js";
import eporner from "./eporner/index.js";
import facebook from "./facebook/index.js";
import fansly from "./fansly/index.js";
import manyvids from "./manyvids/index.js";
import onlyfans from "./onlyfans/index.js";
import patreon from "./patreon/index.js";
import pornhub from "./pornhub/index.js";
import twitch from "./twitch/index.js";
import xvideos from "./xvideos/index.js";
import youtube from "./youtube/index.js";

describe("integrated browser authentication coverage", () => {
  const plugins = [chaturbate, eporner, facebook, fansly, manyvids, onlyfans, patreon, pornhub, twitch, xvideos, youtube];

  it("covers every plugin that requires a browser session or account token", () => {
    for (const plugin of plugins) {
      expect(plugin.manifest.browserAuth, plugin.manifest.name).toBeDefined();
      expect(plugin.manifest.browserAuth?.loginUrl, plugin.manifest.name).toMatch(/^https:\/\//);
      expect(plugin.manifest.settings?.some((field) => field.key === plugin.manifest.browserAuth?.sessionSetting), plugin.manifest.name).toBe(true);
    }
  });

  it("captures Fansly authorization requests and cookie sessions with explicit formats", () => {
    expect(fansly.manifest.browserAuth).toMatchObject({ capture: "authorization-header", requestDomains: ["apiv3.fansly.com"] });
    for (const plugin of plugins.filter((entry) => entry !== fansly && entry !== onlyfans && entry !== manyvids)) {
      expect(plugin.manifest.browserAuth?.capture ?? "cookies", plugin.manifest.name).toBe("cookies");
    }
  });
});
