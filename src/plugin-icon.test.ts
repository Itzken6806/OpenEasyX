import { describe, expect, it } from "vitest";
import { pluginFaviconUrl } from "./plugin-icon.js";

describe("plugin favicon selection", () => {
  it("uses the official source domain and normalizes wildcard and www hosts", () => {
    expect(pluginFaviconUrl({ sourceUrlPatterns: ["https://www.eporner.com/video-*"] })).toBe("https://eporner.com/favicon.ico");
    expect(pluginFaviconUrl({ sourceUrlPatterns: ["https://*.pornhub.com/*"] })).toBe("https://pornhub.com/favicon.ico");
  });

  it("falls back to official homepages but ignores generic and GitHub URLs", () => {
    expect(pluginFaviconUrl({ homepage: "https://www.wikidata.org/" })).toBe("https://wikidata.org/favicon.ico");
    expect(pluginFaviconUrl({ sourceUrlPatterns: ["https://*"], homepage: "https://github.com/yt-dlp/yt-dlp" })).toBeUndefined();
  });
});
