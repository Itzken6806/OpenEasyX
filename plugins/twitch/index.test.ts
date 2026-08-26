import { describe, expect, it } from "vitest";
import { twitchLiveCandidate } from "./index.js";

describe("Twitch plugin", () => {
  it("creates a stable candidate only for an active stream", () => {
    expect(twitchLiveCandidate({ id: "channel", is_live: true, timestamp: 1_700_000_000, title: "Live" }, "https://twitch.tv/channel"))
      .toMatchObject({ externalId: "twitch:channel:1700000000", filename: "channel-1700000000.mp4" });
    expect(twitchLiveCandidate({ id: "channel", live_status: "not_live" }, "https://twitch.tv/channel")).toBeUndefined();
  });
});
