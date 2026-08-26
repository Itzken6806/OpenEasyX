import { describe, expect, it } from "vitest";
import { apiHeaders } from "./api.js";

describe("API request headers", () => {
  it("does not declare JSON for an empty plugin installation request", () => {
    expect(apiHeaders({ method: "POST" }).has("content-type")).toBe(false);
  });

  it("declares JSON when a request has a body", () => {
    expect(apiHeaders({ method: "POST", body: "{}" }).get("content-type")).toBe("application/json");
  });
});
