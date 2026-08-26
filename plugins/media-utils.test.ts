import { describe, expect, it } from "vitest";
import { extractFeedMedia, extractHtmlMedia, filterMedia, htmlPublishedDate, sourcePublishedDate } from "./media-utils.js";

describe("media scraper utilities", () => {
  it("extracts direct, Open Graph, responsive image, and video media from HTML", () => {
    const items = extractHtmlMedia(`
      <meta property="article:published_time" content="2021-03-04T12:30:00Z">
      <meta property="og:image" content="/cover.jpg">
      <img src="/small.jpg" srcset="/small.jpg 320w, /large.webp 1280w" width="1280" height="720" alt="Portrait">
      <video poster="/poster.jpg"><source src="https://cdn.example/movie.mp4" type="video/mp4"></video>
      <a href="/archive.zip">Archive</a>
    `, "https://profile.example/person", "https://profile.example/person");
    expect(items.map((item) => item.externalId)).toEqual(expect.arrayContaining([
      "https://profile.example/cover.jpg", "https://profile.example/large.webp", "https://cdn.example/movie.mp4", "https://profile.example/poster.jpg", "https://profile.example/archive.zip",
    ]));
    expect(items.find((item) => item.externalId.endsWith("large.webp"))).toMatchObject({ mediaType: "image", qualityScore: 921600 });
    expect(items.find((item) => item.externalId.endsWith("movie.mp4"))?.mediaType).toBe("video");
    expect(items.every((item) => item.publishedAt === "2021-03-04T12:30:00.000Z")).toBe(true);
  });

  it("extracts RSS enclosures and embedded entry media with dates", () => {
    const items = extractFeedMedia(`<?xml version="1.0"?><rss><channel><item>
      <title>New post</title><link>https://example.test/posts/1</link><pubDate>Sun, 24 Aug 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example/video.mp4" type="video/mp4" length="1234" />
      <description><![CDATA[<img src="https://cdn.example/photo.jpg">]]></description>
    </item></channel></rss>`, "https://example.test/feed.xml");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "New post", pageUrl: "https://example.test/posts/1", expectedBytes: 1234 });
    expect(items.every((item) => item.publishedAt?.includes("24 Aug 2026"))).toBe(true);
  });

  it("normalizes source dates from compact dates and embedded Unix timestamps", () => {
    expect(sourcePublishedDate("20240203")).toBe("2024-02-03T00:00:00.000Z");
    expect(htmlPublishedDate(String.raw`<script>{\"taken_at_timestamp\":1706955630}</script>`)).toBe("2024-02-03T10:20:30.000Z");
  });

  it("applies administrator media type filters and limits", () => {
    const items = extractHtmlMedia('<img src="a.jpg"><video src="b.mp4"></video><img src="c.jpg">', "https://example.test/");
    expect(filterMedia(items, { includeImages: false, maxItems: 1 })).toMatchObject([{ mediaType: "video" }]);
  });
});
