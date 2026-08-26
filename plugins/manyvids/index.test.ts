import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, { parseManyVidsEntitlements, parseManyVidsHistoryPage, parseManyVidsPurchasedPage, parseManyVidsStorefront } from "./index.js";

const temporaryDirectories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

function sessionFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "easyx-manyvids-")); temporaryDirectories.push(directory);
  const file = path.join(directory, "cookies.txt");
  fs.writeFileSync(file, "# Netscape HTTP Cookie File\n.manyvids.com\tTRUE\t/\tTRUE\t0\tmv_session\taccount-session\n");
  return file;
}

function historyPage(rows: string): string {
  return `<html><a href="/View-my-history/1/">Purchase history</a><table>${rows}</table></html>`;
}

function historyRow(options: { id: string; creatorId?: string; creator?: string; slug: string; title?: string; custom?: boolean; videoPage?: boolean; downloadName?: string }): string {
  const creatorId = options.creatorId ?? "32539";
  const creator = options.creator ?? "cherrycrush";
  return `<tr class="${options.custom ? "customvid" : "video"}">
    <td><a href="/Profile/${creatorId}/${creator}/">${creator}</a></td>
    <td data-delivery-date="2026-08-24 12:34:56">
      ${options.title ? (options.videoPage === false ? `<span>${options.title}</span>` : `<a href="/Video/${options.id}/${options.slug}/" title="View Item">${options.title}</a>`) : "Custom&amp;nbsp;Vid Summary"}
      <a data-type="${options.custom ? "customvid" : "video"}" href="/Invoice/${options.id}">Invoice</a>
      ${options.videoPage === false ? "" : `<a href="/Video/${options.id}/${options.slug}/" title="Stream vid">Stream</a>`}
      <a download="${options.downloadName ?? `${options.id}/file`}" href="/download.php?id=${options.id}&amp;c=&amp;etag=owned-${options.id}">Download</a>
    </td>
  </tr>`;
}

describe("ManyVids plugin", () => {
  it("extracts real preview records from React Flight storefront data", () => {
    const fallback = { key: [[[{ id: "7539883", title: "Preview title", slug: "preview-title", preview: { url: "https://cdn.test/preview.mp4" }, launchDate: "2026-05-25T17:43:58.000Z" }]]] };
    const flight = `1:${JSON.stringify({ swrFallback: fallback })}`;
    const html = `<script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
    expect(parseManyVidsStorefront(html)).toMatchObject([{
      externalId: "manyvids:7539883:preview",
      title: "Preview title (public preview)",
      pageUrl: "https://www.manyvids.com/Video/7539883/preview-title/",
      filename: "7539883-preview.mp4",
    }]);
  });

  it("fails explicitly when the storefront contract is absent", () => {
    expect(() => parseManyVidsStorefront("<html></html>")).toThrow("storefront metadata");
  });

  it("maps account purchases to stable full-video candidates", () => {
    expect(parseManyVidsPurchasedPage({
      statusCode: 200,
      data: { purchased: [{ id: "7539883", title: "Title &amp; more", slug: "title-more", launchDate: "2026-05-25T17:43:58.000Z", creator: { id: "32539" } }] },
      pagination: { page: 1, totalPages: 1 },
    }, "purchase")).toMatchObject([{
      externalId: "manyvids:7539883:full",
      identityKey: "manyvids:7539883:full",
      title: "Title & more (purchased)",
      pageUrl: "https://www.manyvids.com/Video/7539883/title-more/",
      filename: "7539883.mp4",
      metadata: { access: "purchase", manyVidsId: "7539883", creatorId: "32539" },
    }]);
  });

  it("maps the current ManyVids API array response and numeric ids", () => {
    expect(parseManyVidsPurchasedPage({
      statusCode: 200,
      data: [{ id: 7539883, title: "Current API", creator: { id: 32539 } }],
      pagination: { currentPage: 1, totalPages: 1 },
    }, "purchase")).toMatchObject([{
      externalId: "manyvids:7539883:full",
      metadata: { manyVidsId: "7539883", creatorId: "32539" },
    }]);
  });

  it("accepts current creator entitlement responses and top-level creator ids", () => {
    expect(parseManyVidsEntitlements({ statusCode: 200, data: { purchased: [7539883, "7539884"], subscribedToBundle: true } })).toEqual({
      purchasedIds: new Set(["7539883", "7539884"]), subscribedToBundle: true,
    });
    expect(parseManyVidsPurchasedPage({ data: { videos: [{ id: "7539883", title: "Owned", creatorId: 32539 }] } }, "purchase")[0]?.metadata)
      .toMatchObject({ manyVidsId: "7539883", creatorId: "32539" });
  });

  it("extracts purchased and custom downloads from account history for the selected creator", () => {
    const html = historyPage([
      historyRow({ id: "7539883", slug: "Bought-Title", title: "Bought &amp; Title" }),
      historyRow({ id: "7539884", slug: "Private-amp-Custom", custom: true }),
      historyRow({ id: "999", creatorId: "other", slug: "Other", title: "Other creator" }),
    ].join(""));
    expect(parseManyVidsHistoryPage(html, "32539")).toMatchObject([
      {
        externalId: "manyvids:7539883:full",
        title: "Bought & Title (purchased)",
        publishedAt: "2026-08-24T12:34:56",
        metadata: { access: "purchase", creatorId: "32539", downloadUrl: "https://www.manyvids.com/download.php?id=7539883&c=&etag=owned-7539883" },
      },
      {
        externalId: "manyvids:7539884:full",
        title: "Private & Custom (custom media)",
        metadata: { access: "custom", creatorId: "32539", manyVidsId: "7539884" },
      },
    ]);
    expect(parseManyVidsHistoryPage(html, "32539", 100, false).map((item) => item.externalId)).toEqual(["manyvids:7539883:full"]);
  });

  it("keeps delivered custom images that have no public video page", () => {
    const items = parseManyVidsHistoryPage(historyPage(historyRow({
      id: "7539885", slug: "private-photo-custom", title: "Private photo custom", custom: true, videoPage: false, downloadName: "delivery.jpg",
    })), "32539");
    expect(items).toMatchObject([{
      externalId: "manyvids:7539885:full",
      title: "Private photo custom (custom media)",
      pageUrl: "https://www.manyvids.com/View-my-history/1/",
      mediaType: "image",
      filename: "7539885.jpg",
      metadata: { access: "custom", manyVidsId: "7539885" },
    }]);
  });

  it("advertises integrated ManyVids login and optional entitlement groups", () => {
    expect(plugin.manifest.browserAuth).toEqual({ loginUrl: "https://www.manyvids.com/Login", sessionSetting: "cookiesFile", capture: "manyvids" });
    expect(plugin.manifest.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "cookiesFile", type: "session", required: true, cookieDomains: ["manyvids.com"] }),
      expect.objectContaining({ key: "includeCustomVideos", type: "boolean", default: true }),
      expect.objectContaining({ key: "includeBundleAccess", type: "boolean", default: true }),
      expect.objectContaining({ key: "includePremiumAccess", type: "boolean", default: true }),
    ]));
  });

  it("lists and deduplicates account entitlements for the selected creator", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect((init?.headers as Record<string, string>).cookie).toContain("mv_session=account-session");
      if (url.endsWith("/View-my-history/1/")) return new Response(historyPage(historyRow({ id: "one", slug: "bought", title: "Bought" })), { status: 200 });
      if (url.endsWith("/View-my-history/2/")) return new Response(historyPage(""), { status: 200 });
      if (url.endsWith("/store/videos/32539/private")) return new Response(JSON.stringify({ statusCode: 200, data: { purchased: [], subscribedToBundle: false } }), { status: 200 });
      expect(url).not.toContain("creator=");
      const purchased = url.includes("sort=custom") ? [] : url.includes("bundle=true")
        ? [{ id: "one", title: "Bought", slug: "bought", creator: { id: "32539" } }, { id: "two", title: "Bundle", slug: "bundle", creator: { id: "32539" } }]
        : url.includes("premium=true") ? [] : [{ id: "ignored", title: "Other creator", creator: { id: "999" } }];
      expect(url).toContain("https://api.manyvids.com/store/library/purchased?");
      return new Response(JSON.stringify({ statusCode: 200, data: purchased, pagination: { currentPage: 1, totalPages: 1 } }), { status: 200 });
    });
    const items = await plugin.listMedia!({
      config: { cookiesFile: sessionFile(), includeBundleAccess: true, includePremiumAccess: true },
      fetch: fetchMock as typeof fetch,
      runCommand: vi.fn(), log: vi.fn(),
    }, { id: "source", externalId: "profile", performerId: "person", profileUrl: "https://www.manyvids.com/Profile/32539/cherrycrush/", domain: "manyvids.com" });
    expect(items.map((item) => item.externalId)).toEqual(["manyvids:one:full", "manyvids:two:full"]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("filters the unfiltered modern purchase library locally when ManyVids creator filtering is broken", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/View-my-history/1/")) return new Response(historyPage(""), { status: 200 });
      if (url.endsWith("/store/videos/32539/private")) return new Response(JSON.stringify({ statusCode: 200, data: { purchased: [], subscribedToBundle: false } }), { status: 200 });
      if (url.includes("sort=custom")) return new Response(JSON.stringify({ statusCode: 200, data: [], pagination: { currentPage: 1, totalPages: 1 } }), { status: 200 });
      expect(url).not.toContain("creator=");
      return new Response(JSON.stringify({
        statusCode: 200,
        data: { purchased: [
          { id: "owned", title: "Modern purchase", creator: { id: "32539" } },
          { id: "other", title: "Other creator", creator: { id: "999" } },
        ] },
        pagination: { currentPage: 1, totalPages: 1 },
      }), { status: 200 });
    });
    const items = await plugin.listMedia!({
      config: { cookiesFile: sessionFile(), includeBundleAccess: false, includePremiumAccess: false },
      fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { id: "source", externalId: "profile", performerId: "person", profileUrl: "https://www.manyvids.com/Profile/32539/cherrycrush/", domain: "manyvids.com" });
    expect(items.map((item) => item.externalId)).toEqual(["manyvids:owned:full"]);
    expect(items[0]?.metadata).toMatchObject({ access: "purchase", creatorId: "32539" });
  });

  it("joins the current per-creator entitlement endpoint with storefront videos", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/store/videos/32539/private")) return new Response(JSON.stringify({
        statusCode: 200, data: { purchased: ["7539883"], subscribedToBundle: false },
      }), { status: 200 });
      if (url.endsWith("/View-my-history/1/")) return new Response(historyPage(""), { status: 200 });
      if (url.includes("/store/library/purchased?")) return new Response(JSON.stringify({
        statusCode: 200, data: [], pagination: { currentPage: 1, totalPages: 1 },
      }), { status: 200 });
      if (url.includes("/store/videos/32539?")) return new Response(JSON.stringify({
        statusCode: 200,
        data: [{ id: "7539883", title: "Current owned video", slug: "current-owned-video", creator: { id: "32539" } }],
        pagination: { currentPage: 1, totalPages: 1 },
      }), { status: 200 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const items = await plugin.listMedia!({
      config: { cookiesFile: sessionFile(), includeBundleAccess: false, includePremiumAccess: false },
      fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { id: "source", externalId: "profile", performerId: "person", profileUrl: "https://www.manyvids.com/Profile/32539/cherrycrush/", domain: "manyvids.com" });
    expect(items).toMatchObject([{
      externalId: "manyvids:7539883:full",
      title: "Current owned video (purchased)",
      metadata: { access: "purchase", creatorId: "32539" },
    }]);
  });

  it("refuses to substitute public previews when the account session is absent", async () => {
    const fetchMock = vi.fn();
    await expect(plugin.listMedia!({
      config: { includePublicPreviews: true }, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { id: "source", externalId: "profile", performerId: "person", profileUrl: "https://www.manyvids.com/Profile/32539/cherrycrush/", domain: "manyvids.com" }))
      .rejects.toThrow("will not replace purchased media with public previews");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a purchased history entry to its authorized original file", async () => {
    const cookiesFile = sessionFile();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://www.manyvids.com/download.php?id=7539883&c=&etag=owned");
      expect((init?.headers as Record<string, string>).cookie).toContain("mv_session=account-session");
      return new Response(JSON.stringify({ original: { file_url: "https://cdn10.manyvids.com/account/original.mp4?signed=yes" } }), { status: 200 });
    });
    const request = await plugin.resolveDownload!({
      config: { cookiesFile }, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { externalId: "manyvids:7539883:full", pageUrl: "https://www.manyvids.com/Video/7539883/title/", mediaType: "video", filename: "7539883.mp4", metadata: { access: "custom", manyVidsId: "7539883", downloadUrl: "https://www.manyvids.com/download.php?id=7539883&c=&etag=owned" } });
    expect(request).toEqual({ kind: "http", url: "https://cdn10.manyvids.com/account/original.mp4?signed=yes", headers: { referer: "https://www.manyvids.com/" }, filename: "7539883.mp4" });
  });

  it("preserves the delivered image type when a custom authorization returns a photo", async () => {
    const cookiesFile = sessionFile();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      original: { file_url: "https://cdn10.manyvids.com/account/private-delivery.jpg?signed=yes", filename: "private-delivery.jpg" },
    }), { status: 200 }));
    const request = await plugin.resolveDownload!({
      config: { cookiesFile }, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, {
      externalId: "manyvids:7539885:full", pageUrl: "https://www.manyvids.com/View-my-history/1/", mediaType: "image", filename: "7539885.mp4",
      metadata: { access: "custom", manyVidsId: "7539885", downloadUrl: "https://www.manyvids.com/download.php?id=7539885" },
    });
    expect(request).toEqual({
      kind: "http", url: "https://cdn10.manyvids.com/account/private-delivery.jpg?signed=yes",
      headers: { referer: "https://www.manyvids.com/" }, filename: "7539885.jpg",
    });
  });

  it("resolves API-library purchases directly from ManyVids' private authorization response", async () => {
    const cookiesFile = sessionFile();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ statusCode: 200, data: { filepath: "https://cdn10.manyvids.com/account/original.mp4?signed=yes", transcodedFilepath: "https://cdn10.manyvids.com/account/transcoded.mp4" } }), { status: 200 }));
    const request = await plugin.resolveDownload!({
      config: { cookiesFile }, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { externalId: "manyvids:7539883:full", pageUrl: "https://www.manyvids.com/Video/7539883/title/", mediaType: "video", filename: "7539883.mp4", metadata: { access: "purchase", manyVidsId: "7539883", extractorUrl: "https://www.manyvids.com/Video/7539883/title/" } });
    expect(request).toEqual({ kind: "http", url: "https://cdn10.manyvids.com/account/original.mp4?signed=yes", headers: { referer: "https://www.manyvids.com/" }, filename: "7539883.mp4" });
  });

  it("keeps previously discovered public previews downloadable after the upgrade", async () => {
    const fetchMock = vi.fn();
    const request = await plugin.resolveDownload!({
      config: {}, fetch: fetchMock as typeof fetch, runCommand: vi.fn(), log: vi.fn(),
    }, { externalId: "manyvids:7539883:preview", pageUrl: "https://www.manyvids.com/Video/7539883/title/", mediaType: "video", metadata: { extractorUrl: "https://www.manyvids.com/Video/7539883/title/" } });
    expect(request).toMatchObject({ kind: "command", command: "yt-dlp" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
