import { describe, expect, it } from "vitest";
import {
  availableStock,
  canTransitionStatus,
  initialOrderStatus,
  isCancellableStatus,
  isTerminalStatus,
  migrateLegacyStatus,
} from "@/lib/commerce/order-status";

describe("availableStock", () => {
  it("subtracts reserved from on-hand", () => {
    expect(availableStock(5, 4)).toBe(1);
  });

  it("never goes negative when reserved exceeds on-hand", () => {
    expect(availableStock(2, 5)).toBe(0);
  });

  it("treats missing reserved as zero", () => {
    expect(availableStock(3)).toBe(3);
  });
});

describe("initialOrderStatus", () => {
  it("completes POS immediately", () => {
    expect(initialOrderStatus("pos")).toBe("completed");
  });

  it("starts online orders as new", () => {
    expect(initialOrderStatus("delivery")).toBe("new");
    expect(initialOrderStatus("pickup")).toBe("new");
  });
});

describe("canTransitionStatus", () => {
  it("allows delivery kitchen flow", () => {
    expect(canTransitionStatus("delivery", "new", "accepted")).toBe(true);
    expect(canTransitionStatus("delivery", "ready", "assigned")).toBe(true);
  });

  it("blocks skipping ahead", () => {
    expect(canTransitionStatus("delivery", "new", "delivered")).toBe(false);
  });

  it("allows same-status no-op", () => {
    expect(canTransitionStatus("pickup", "preparing", "preparing")).toBe(true);
  });
});

describe("terminal / cancellable", () => {
  it("marks delivered and cancelled as terminal", () => {
    expect(isTerminalStatus("delivered")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("preparing")).toBe(false);
  });

  it("allows cancel before terminal (and completed POS)", () => {
    expect(isCancellableStatus("new")).toBe(true);
    expect(isCancellableStatus("completed")).toBe(true);
    expect(isCancellableStatus("delivered")).toBe(false);
  });
});

describe("migrateLegacyStatus", () => {
  it("maps legacy delivery statuses", () => {
    expect(migrateLegacyStatus("processing", "delivery")).toBe("new");
    expect(migrateLegacyStatus("shipped", "delivery")).toBe("assigned");
  });

  it("maps legacy pickup statuses", () => {
    expect(migrateLegacyStatus("processing", "pickup")).toBe("preparing");
    expect(migrateLegacyStatus("shipped", "pickup")).toBe("preparing");
  });
});
