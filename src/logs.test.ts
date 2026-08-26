import { describe, expect, it } from "vitest";
import { mergeLogEntries, type LogEntry } from "./logs.js";

const entry = (id: number, message = String(id)): LogEntry => ({ id, timestamp: "2026-01-01T00:00:00.000Z", level: "info", scope: "test", message });

describe("mergeLogEntries", () => {
  it("deduplicates replayed SSE entries and preserves chronological order", () => {
    expect(mergeLogEntries([entry(2)], [entry(1), entry(2, "updated"), entry(3)])).toEqual([entry(1), entry(2, "updated"), entry(3)]);
  });

  it("retains only the newest bounded entries", () => {
    expect(mergeLogEntries([entry(1), entry(2)], [entry(3)], 2)).toEqual([entry(2), entry(3)]);
  });
});
