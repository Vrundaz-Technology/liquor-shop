import { describe, expect, it } from "vitest";
import {
  chooseDispatchChannel,
  formatPhoneForShipday,
  isDeliveryConfirmedForDispatch,
  orderStatusAfterAssign,
  canMarkInternalPickedUp,
} from "@/lib/commerce/dispatch";

describe("chooseDispatchChannel", () => {
  it("stays manual", () => {
    expect(
      chooseDispatchChannel({
        policy: "manual",
        internalEnabled: true,
        shipdayEnabled: true,
        hasAvailableDriver: true,
        shipdayConfigured: true,
      }),
    ).toBe("none");
  });

  it("prefers an internal driver on confirmation", () => {
    expect(
      chooseDispatchChannel({
        policy: "internal_first",
        internalEnabled: true,
        shipdayEnabled: true,
        hasAvailableDriver: true,
        shipdayConfigured: true,
      }),
    ).toBe("internal");
  });

  it("falls back to Shipday when no driver is free", () => {
    expect(
      chooseDispatchChannel({
        policy: "internal_first",
        internalEnabled: true,
        shipdayEnabled: true,
        hasAvailableDriver: false,
        shipdayConfigured: true,
      }),
    ).toBe("shipday");
  });

  it("uses Shipday first when policy says so", () => {
    expect(
      chooseDispatchChannel({
        policy: "shipday_always",
        internalEnabled: true,
        shipdayEnabled: true,
        hasAvailableDriver: true,
        shipdayConfigured: true,
      }),
    ).toBe("shipday");
  });
});

describe("confirmation vs pickup", () => {
  it("allows assign at confirmation", () => {
    expect(isDeliveryConfirmedForDispatch("new")).toBe(true);
    expect(isDeliveryConfirmedForDispatch("preparing")).toBe(true);
    expect(isDeliveryConfirmedForDispatch("cancelled")).toBe(false);
  });

  it("keeps kitchen status when assigning at confirmation", () => {
    expect(orderStatusAfterAssign("new")).toBe("new");
    expect(orderStatusAfterAssign("preparing")).toBe("preparing");
    expect(orderStatusAfterAssign("ready")).toBe("assigned");
  });

  it("blocks internal pickup until packed", () => {
    expect(canMarkInternalPickedUp("preparing")).toBe(false);
    expect(canMarkInternalPickedUp("ready")).toBe(true);
  });
});

describe("formatPhoneForShipday", () => {
  it("adds +1 for 10-digit US numbers", () => {
    expect(formatPhoneForShipday("(212) 555-0188")).toBe("+12125550188");
  });
});
