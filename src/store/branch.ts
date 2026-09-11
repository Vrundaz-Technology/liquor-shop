"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAllLocations, getLocationById } from "@/data/locations";
import type { StoreLocation } from "@/types";

type BranchState = {
  branchId: string;
  /** Last ZIP used for store finder (drives delivery-time filters). */
  customerZip: string;
  customerLat: number | null;
  customerLng: number | null;
  setBranch: (id: string) => void;
  setCustomerLocation: (input: {
    zip: string;
    lat?: number | null;
    lng?: number | null;
  }) => void;
  branch: () => StoreLocation;
};

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branchId: "loc1",
      customerZip: "",
      customerLat: null,
      customerLng: null,
      setBranch: (id) => set({ branchId: id }),
      setCustomerLocation: ({ zip, lat = null, lng = null }) =>
        set({
          customerZip: zip.trim().slice(0, 10),
          customerLat: lat,
          customerLng: lng,
        }),
      branch: () => {
        const locs = getAllLocations();
        return getLocationById(get().branchId) ?? locs[0];
      },
    }),
    {
      name: "sams-branch",
      partialize: (s) => ({
        branchId: s.branchId,
        customerZip: s.customerZip,
        customerLat: s.customerLat,
        customerLng: s.customerLng,
      }),
    },
  ),
);
