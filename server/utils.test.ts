import { describe, expect, it } from "vitest";
import { domainFromUrl, safeSegment } from "./utils.js";

describe("storage utilities", () => {
  it("creates safe portable path segments", () => expect(safeSegment('../A/B:*? "name"')).toBe("A-B-name"));
  it("normalizes source domains", () => expect(domainFromUrl("https://www.Example.COM/profile/1")).toBe("example.com"));
  it("does not mistake invalid URLs for a domain", () => expect(domainFromUrl("not a url")).toBe("unknown-source"));
});
