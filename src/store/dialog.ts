"use client";

import { create } from "zustand";

export type DialogTone = "default" | "danger";

type ConfirmRequest = {
  mode: "confirm";
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  resolve: (ok: boolean) => void;
};

type PromptRequest = {
  mode: "prompt";
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputLabel?: string;
  placeholder?: string;
  minLength?: number;
  resolve: (value: string | null) => void;
};

type AlertRequest = {
  mode: "alert";
  title: string;
  description?: string;
  confirmLabel?: string;
  resolve: (ok: true) => void;
};

export type DialogRequest = ConfirmRequest | PromptRequest | AlertRequest;

type DialogState = {
  request: DialogRequest | null;
  open: (request: DialogRequest) => void;
  close: () => void;
};

function dismiss(request: DialogRequest | null) {
  if (!request) return;
  if (request.mode === "confirm") request.resolve(false);
  else if (request.mode === "prompt") request.resolve(null);
  else request.resolve(true);
}

export const useDialogStore = create<DialogState>((set, get) => ({
  request: null,
  open: (request) => {
    dismiss(get().request);
    set({ request });
  },
  close: () => {
    dismiss(get().request);
    set({ request: null });
  },
}));

export function confirmAction(
  opts: Omit<ConfirmRequest, "mode" | "resolve">,
): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({ mode: "confirm", ...opts, resolve });
  });
}

export function promptAction(
  opts: Omit<PromptRequest, "mode" | "resolve">,
): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({ mode: "prompt", ...opts, resolve });
  });
}

export function alertAction(opts: Omit<AlertRequest, "mode" | "resolve">): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      mode: "alert",
      ...opts,
      resolve: () => resolve(),
    });
  });
}
