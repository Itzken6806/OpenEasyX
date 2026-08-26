import { describe, expect, it } from "vitest";
import { parseEuroPornstarResults } from "./index.js";

describe("EuroPornstar plugin", () => {
  it("parses model search cards", () => {
    const html = `<div class="list-pics"><a href='/Sasha2/Sasha.html'><div class=thum><img src='Sasha2/preview.jpg'><br>Sasha Rose</div></a></div>`;
    expect(parseEuroPornstarResults(html)).toEqual([{ id: "/Sasha2/Sasha.html", name: "Sasha Rose", imageUrl: "https://www.europornstar.com/Sasha2/preview.jpg", url: "https://www.europornstar.com/Sasha2/Sasha.html" }]);
  });
});
