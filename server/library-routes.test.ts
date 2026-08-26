import { describe, expect, it } from "vitest";
import { parseMediaRange } from "./library-routes";

describe("media byte ranges", () => {
  it("serves ordinary and open-ended browser ranges", () => {
    expect(parseMediaRange("bytes=100-199", 1_000)).toEqual({ start: 100, end: 199 });
    expect(parseMediaRange("bytes=900-", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseMediaRange("bytes=900-1200", 1_000)).toEqual({ start: 900, end: 999 });
  });

  it("serves suffix ranges from the end of the media file", () => {
    expect(parseMediaRange("bytes=-200", 1_000)).toEqual({ start: 800, end: 999 });
    expect(parseMediaRange("bytes=-1200", 1_000)).toEqual({ start: 0, end: 999 });
  });

  it("rejects malformed, empty, multiple, and unsatisfiable ranges", () => {
    expect(parseMediaRange("bytes=-0", 1_000)).toBeUndefined();
    expect(parseMediaRange("bytes=1000-", 1_000)).toBeUndefined();
    expect(parseMediaRange("bytes=200-100", 1_000)).toBeUndefined();
    expect(parseMediaRange("bytes=0-10,20-30", 1_000)).toBeUndefined();
  });
});
