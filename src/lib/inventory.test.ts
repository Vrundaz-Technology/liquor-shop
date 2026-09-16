import { describe, expect, it } from "vitest";
import { stockKey, stockStatus } from "@/lib/inventory";

describe("inventory helpers", () => {
  it("builds location:product keys", () => {
    expect(stockKey("loc-1", "prod-9")).toBe("loc-1:prod-9");
  });

  it("classifies stock bands", () => {
    expect(stockStatus(0)).toBe("out");
    expect(stockStatus(2)).toBe("low");
    expect(stockStatus(20)).toBe("ok");
  });
});
