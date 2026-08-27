import { describe, expect, it } from "vitest";
import chaturbate, { chaturbateLiveCam, chaturbateLiveCamPage, chaturbateLiveCandidate, normalizedChaturbateUrl } from "./index.js";
import { ytDlpDownload } from "../yt-dlp-utils.js";

describe("Chaturbate plugin", () => {
  it("creates one stable candidate for an active live session", () => {
    expect(chaturbateLiveCandidate({ id: "model", title: "Model live", is_live: true, timestamp: 1_700_000_000, formats: [{ url: "https://cdn.example/live.m3u8" }] }, "https://chaturbate.com/model/"))
      .toMatchObject({ externalId: "chaturbate:model:1700000000", mediaType: "video", filename: "model-1700000000.mp4" });
  });

  it("returns no candidate while the room is offline", () => {
    expect(chaturbateLiveCandidate({ id: "model", live_status: "not_live" }, "https://chaturbate.com/model/")).toBeUndefined();
  });

  it("keeps a session stable when only signed stream parameters rotate", () => {
    const first = chaturbateLiveCandidate({ id: "model", is_live: true, formats: [{ url: "https://cdn.example/v1/edge/streams/origin.model.SESSION/chunklist.m3u8?token=one" }] }, "https://chaturbate.com/model/");
    const refreshed = chaturbateLiveCandidate({ id: "model", is_live: true, formats: [{ url: "https://cdn.example/v1/edge/streams/origin.model.SESSION/chunklist.m3u8?token=two" }] }, "https://chaturbate.com/model/");
    const nextLive = chaturbateLiveCandidate({ id: "model", is_live: true, formats: [{ url: "https://cdn.example/v1/edge/streams/origin.model.NEXT/chunklist.m3u8?token=three" }] }, "https://chaturbate.com/model/");
    expect(refreshed?.externalId).toBe(first?.externalId);
    expect(nextLive?.externalId).not.toBe(first?.externalId);
  });

  it("normalizes room casing and selects the live-compatible format", () => {
    expect(normalizedChaturbateUrl("https://chaturbate.com/CherryCrush/")).toBe("https://chaturbate.com/cherrycrush/");
    const request = ytDlpDownload({ externalId: "live", pageUrl: "https://chaturbate.com/cherrycrush/", mediaType: "video" }, {}, { live: true });
    expect(request.args[request.args.indexOf("--format") + 1]).toBe("bestvideo+bestaudio/best");
    expect(request.args).toContain("--no-hls-use-mpegts");
  });

  it("normalizes public room-list entries for the Viewer live aggregation", () => {
    expect(chaturbateLiveCam({ username: "alice", current_show: "public", num_users: 42, tags: ["french", "chat"], img: "//images.example/alice.jpg", age: 24 }))
      .toMatchObject({ id: "alice", username: "alice", viewers: 42, age: 24, thumbnailUrl: "https://images.example/alice.jpg" });
    expect(chaturbateLiveCam({ username: "private_room", current_show: "private" })).toBeUndefined();
    expect(chaturbateLiveCamPage({ rooms: [{ username: "alice" }, { username: "bob" }], total_count: 51 }, 2, 24))
      .toMatchObject({ total: 51, page: 2, pageSize: 24, pages: 3, cams: [{ username: "alice" }, { username: "bob" }] });
  });

  it("applies text search to the provider result and reports the filtered count", async () => {
    const fetch = async () => new Response(JSON.stringify({
      rooms: [{ username: "alice", room_subject: "French chat", tags: ["friendly"] }, { username: "bob", room_subject: "Music" }], total_count: 2,
    }), { status: 200 });
    const page = await chaturbate.listLiveCams!({ fetch } as never, { page: 1, pageSize: 24, search: "alice" });
    expect(page).toMatchObject({ total: 1, cams: [{ username: "alice" }] });
  });
});
