import { describe, expect, it } from "vitest";
import plugin, { tumblrFeedUrl } from "./index.js";

describe("public Tumblr plugin", () => {
  it("maps both Tumblr profile URL forms to the native public feed", () => {
    expect(tumblrFeedUrl("https://staff.tumblr.com/archive")).toBe("https://staff.tumblr.com/rss");
    expect(tumblrFeedUrl("https://www.tumblr.com/staff")).toBe("https://staff.tumblr.com/rss");
  });

  it("requires neither account cookies nor API credentials", () => {
    expect(plugin.manifest.browserAuth).toBeUndefined();
    expect(plugin.manifest.settings?.map((field) => field.key)).toEqual(["maxItems", "includeImages", "includeVideos"]);
  });
});
