import { describe, expect, it } from "vitest";
import { formatGuidLike } from "./guid";

const REGISTRY = "{0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9}";

describe("formatGuidLike", () => {
  it("matches a bare lower-case sample, the form Pages reports", () => {
    expect(formatGuidLike(REGISTRY, "11111111-2222-3333-4444-aaaaaaaaaaaa")).toBe(
      "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
    );
  });

  it("matches a braced upper-case sample", () => {
    expect(formatGuidLike("0a1b2c3d4e5f60718293a4b5c6d7e8f9", "{11111111-2222-3333-4444-AAAAAAAAAAAA}")).toBe(
      REGISTRY,
    );
  });

  it("drops hyphens when the sample has none", () => {
    expect(formatGuidLike(REGISTRY, "11111111222233334444aaaaaaaaaaaa")).toBe(
      "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
    );
  });

  it("leaves the value alone when either side is not a guid", () => {
    expect(formatGuidLike(REGISTRY, "")).toBe(REGISTRY);
    expect(formatGuidLike("/sitecore/content/x", "11111111-2222-3333-4444-aaaaaaaaaaaa")).toBe(
      "/sitecore/content/x",
    );
  });
});
