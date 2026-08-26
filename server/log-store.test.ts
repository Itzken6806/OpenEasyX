import { describe, expect, it, vi } from "vitest";
import { LogStore } from "./log-store.js";

describe("LogStore", () => {
  it("keeps a bounded history and supports live subscriptions", () => {
    const store = new LogStore(2); const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    store.add("info", "server", "one"); store.add("warn", "plugin:test", "two"); unsubscribe(); store.add("error", "download", "three");
    expect(store.list()).toMatchObject([{ message: "two" }, { message: "three" }]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.list({ level: "warn" })).toHaveLength(1);
    expect(store.list({ search: "download" })[0].message).toBe("three");
  });

  it("redacts secrets and serializes errors safely", () => {
    const store = new LogStore();
    const entry = store.add("error", "plugin:test", "failed", { authorization: "Bearer private", nested: { sessionToken: "private", error: new Error("boom") } });
    expect(entry.details).toMatchObject({ authorization: "[REDACTED]", nested: { sessionToken: "[REDACTED]", error: { message: "boom" } } });
  });
});
