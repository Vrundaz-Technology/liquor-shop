"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryAddress, DeliveryStatus, Driver, Order } from "@/types";
import { drivers as seedDrivers } from "@/data/drivers";

type DeliveryState = {
  drivers: Driver[];
  byOrder: Record<
    string,
    { driverId?: string; status: DeliveryStatus; delivery?: DeliveryAddress }
  >;
  attach: (orderId: string, delivery: DeliveryAddress) => void;
  assign: (orderId: string, driverId: string) => void;
  setStatus: (orderId: string, status: DeliveryStatus) => void;
  upsertDriver: (driver: Driver) => void;
  setDriverActive: (driverId: string, active: boolean) => void;
  enrich: (order: Order) => Order;
};

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set, get) => ({
      drivers: seedDrivers,
      byOrder: {},
      attach: (orderId, delivery) =>
        set((s) => ({
          byOrder: {
            ...s.byOrder,
            [orderId]: { ...s.byOrder[orderId], status: "unassigned", delivery },
          },
        })),
      assign: (orderId, driverId) =>
        set((s) => {
          const previousId = s.byOrder[orderId]?.driverId;
          return {
            byOrder: {
              ...s.byOrder,
              [orderId]: { ...s.byOrder[orderId], driverId, status: "assigned" },
            },
            drivers: s.drivers.map((driver) => {
              if (driver.id === driverId) {
                if (!driver.active) return driver;
                return { ...driver, status: "on_route" };
              }
              if (previousId && driver.id === previousId && previousId !== driverId) {
                const stillBusy = Object.entries(s.byOrder).some(
                  ([id, row]) =>
                    id !== orderId &&
                    row.driverId === previousId &&
                    row.status !== "delivered" &&
                    row.status !== "unassigned",
                );
                return stillBusy ? driver : { ...driver, status: "available" };
              }
              return driver;
            }),
          };
        }),
      setStatus: (orderId, status) =>
        set((s) => {
          const current = s.byOrder[orderId];
          const driverId = current?.driverId;
          return {
            byOrder: {
              ...s.byOrder,
              [orderId]: { ...current, status },
            },
            drivers: s.drivers.map((driver) =>
              driver.id === driverId
                ? {
                    ...driver,
                    status: status === "delivered" || status === "unassigned" ? "available" : "on_route",
                  }
                : driver,
            ),
          };
        }),
      upsertDriver: (driver) =>
        set((s) => {
          const idx = s.drivers.findIndex((item) => item.id === driver.id);
          if (idx >= 0) {
            return {
              drivers: s.drivers.map((item, index) => (index === idx ? driver : item)),
            };
          }
          return { drivers: [...s.drivers, driver] };
        }),
      setDriverActive: (driverId, active) =>
        set((s) => ({
          drivers: s.drivers.map((driver) =>
            driver.id === driverId
              ? { ...driver, active, status: active ? "available" : "offline" }
              : driver,
          ),
        })),
      enrich: (order) => {
        const extra = get().byOrder[order.id];
        const driver = extra?.driverId
          ? get().drivers.find((item) => item.id === extra.driverId)
          : order.driver;
        return {
          ...order,
          delivery: extra?.delivery ?? order.delivery,
          deliveryStatus: extra?.status ?? order.deliveryStatus,
          driverId: extra?.driverId ?? order.driverId,
          driver,
        };
      },
    }),
    { name: "sams-delivery" },
  ),
);
