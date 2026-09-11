"use client";

import { create } from "zustand";

export type CartNotice = {
  id: number;
  productId: string;
  added: number;
  quantity: number;
};

type CartFeedbackState = {
  notice: CartNotice | null;
  warning: string | null;
  info: string | null;
  bump: number;
  notify: (productId: string, added: number, quantity: number) => void;
  notifyWarning: (message: string) => void;
  notifyInfo: (message: string) => void;
  dismiss: () => void;
  dismissWarning: () => void;
  dismissInfo: () => void;
};

let nextId = 1;

export const useCartFeedbackStore = create<CartFeedbackState>((set) => ({
  notice: null,
  warning: null,
  info: null,
  bump: 0,
  notify: (productId, added, quantity) =>
    set({
      notice: { id: nextId++, productId, added, quantity },
      bump: Date.now(),
      warning: null,
      info: null,
    }),
  notifyWarning: (message) =>
    set({
      warning: message,
      bump: Date.now(),
      info: null,
    }),
  notifyInfo: (message) =>
    set({
      info: message,
      bump: Date.now(),
      warning: null,
    }),
  dismiss: () => set({ notice: null }),
  dismissWarning: () => set({ warning: null }),
  dismissInfo: () => set({ info: null }),
}));
