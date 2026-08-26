import { describe, expect, it } from "vitest";
import { parseStarDirectory } from "./index.js";

describe("JavLibrary plugin", () => {
  it("parses and deduplicates performer directory entries", () => {
    const html = `<div class="starbox"><div class="searchitem"><a href="vl_star.php?s=abc12">Mikami Yua</a></div><a href="./vl_star.php?s=abc12">Mikami Yua</a></div>`;
    expect(parseStarDirectory(html)).toEqual([{ id: "abc12", name: "Mikami Yua" }]);
  });
});
