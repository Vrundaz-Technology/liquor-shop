"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useDialogStore } from "@/store/dialog";

export function AppDialog() {
  const request = useDialogStore((s) => s.request);
  const [value, setValue] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    setValue("");
    settled.current = false;
  }, [request]);

  if (!request) return null;

  const finish = (result: boolean | string | null) => {
    if (settled.current) return;
    settled.current = true;
    if (request.mode === "confirm") request.resolve(Boolean(result));
    else if (request.mode === "prompt") {
      request.resolve(typeof result === "string" ? result : null);
    } else {
      request.resolve(true);
    }
    setValue("");
    useDialogStore.setState({ request: null });
  };

  const confirmLabel =
    request.confirmLabel ??
    (request.mode === "confirm" ? "Confirm" : request.mode === "prompt" ? "Submit" : "OK");
  const cancelLabel = request.mode === "alert" ? undefined : (request.cancelLabel ?? "Cancel");
  const danger = request.mode === "confirm" && request.tone === "danger";
  const minLength = request.mode === "prompt" ? (request.minLength ?? 1) : 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (request.mode === "prompt") {
      const next = value.trim();
      if (next.length < minLength) return;
      finish(next);
      return;
    }
    finish(true);
  };

  return (
    <Modal
      open
      title={request.title}
      onClose={() => finish(request.mode === "alert" ? true : request.mode === "prompt" ? null : false)}
      className="sm:max-w-md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {cancelLabel ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => finish(request.mode === "prompt" ? null : false)}
            >
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="submit"
            form="app-dialog-form"
            size="sm"
            variant={danger ? "outline" : "primary"}
            className={danger ? "border-(--danger)/50 text-(--danger) hover:bg-(--danger)/10" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <form id="app-dialog-form" onSubmit={onSubmit} className="space-y-3">
        {request.description ? <p className="text-sm leading-relaxed text-muted">{request.description}</p> : null}
        {request.mode === "prompt" ? (
          <>
            <label className="block text-xs text-muted">
              {request.inputLabel ?? "Details"}
              <Input
                className="mt-1"
                value={value}
                autoFocus
                minLength={minLength}
                placeholder={request.placeholder}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
          </>
        ) : !request.description ? (
          <p className="text-sm text-muted">
            {request.mode === "alert" ? "Okay." : "Please confirm this action."}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
