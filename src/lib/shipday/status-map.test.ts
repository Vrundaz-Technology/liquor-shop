import { describe, expect, it } from "vitest";
import { mapShipdayStatus } from "@/lib/shipday/status-map";

describe("mapShipdayStatus", () => {
  it("keeps waiting states as assigned without advancing kitchen", () => {
    expect(mapShipdayStatus("NOT_ASSIGNED")).toEqual({
      deliveryStatus: "assigned",
      orderStatus: null,
      failed: false,
    });
  });

  it("maps pickup to out for delivery", () => {
    expect(mapShipdayStatus("PICKED_UP").deliveryStatus).toBe("en_route");
    expect(mapShipdayStatus("PICKED_UP").orderStatus).toBe("out_for_delivery");
  });

  it("marks delivered", () => {
    expect(mapShipdayStatus("ALREADY_DELIVERED").orderStatus).toBe("delivered");
  });

  it("flags failures without marking delivered", () => {
    const mapped = mapShipdayStatus("FAILED_DELIVERY");
    expect(mapped.failed).toBe(true);
    expect(mapped.orderStatus).toBeNull();
  });
});
