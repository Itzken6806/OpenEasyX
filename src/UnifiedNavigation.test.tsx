import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnifiedNavigation } from "./UnifiedNavigation";

describe("UnifiedNavigation", () => {
  it("renders one complete menu without legacy section names", () => {
    const html = renderToStaticMarkup(<UnifiedNavigation pathname="/library"/>);

    expect(html).toContain("Overview");
    expect(html).toContain("Library");
    expect(html).toContain("Live Cam");
    expect(html).toContain("Discover");
    expect(html).toContain("Plugins");
    expect(html).toContain("Settings");
    expect(html).not.toContain("Media &amp; Live");
    expect(html).not.toContain("Workspace");
  });
});
