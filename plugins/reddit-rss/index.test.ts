import { describe, expect, it } from "vitest";
import { redditFeed } from "./index.js";

describe("Reddit RSS plugin", () => {
  it("maps subreddit and user pages to their public RSS feeds", () => {
    expect(redditFeed("https://reddit.com/r/example/")).toBe("https://www.reddit.com/r/example/.rss");
    expect(redditFeed("https://www.reddit.com/user/example")).toBe("https://www.reddit.com/user/example/submitted/.rss");
  });

  it("rejects non-Reddit URLs", () => {
    expect(() => redditFeed("https://example.test/r/example")).toThrow("only supports reddit.com");
  });
});
