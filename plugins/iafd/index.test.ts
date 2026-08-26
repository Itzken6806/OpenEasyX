import { describe, expect, it } from "vitest";
import { parseIafdResults } from "./index.js";

describe("IAFD plugin", () => {
  it("parses performer rows with images and aliases", () => {
    const html = `<table id="tblFem"><tr><td><a href="/person.rme/id=abc"><img src="/head.jpg"></a></td><td><a href="/person.rme/id=abc">Cherry Crush</a></td><td>Alice, Alise Seduce</td><td>2025</td></tr></table>`;
    expect(parseIafdResults(html)).toEqual([{ id: "abc", name: "Cherry Crush", imageUrl: "https://www.iafd.com/head.jpg", aliases: ["Alice", "Alise Seduce"], url: "https://www.iafd.com/person.rme/id=abc" }]);
  });
});
