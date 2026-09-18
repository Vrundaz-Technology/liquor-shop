"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREFS_EVENT,
  readNotificationPrefs,
  writeNotificationPrefs,
  type NotificationDevicePrefs,
} from "@/lib/notifications/device-prefs";

export function useNotificationDevicePrefs() {
  const [prefs, setPrefs] = useState<NotificationDevicePrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setPrefs(readNotificationPrefs());
    sync();
    setReady(true);
    window.addEventListener(NOTIFICATION_PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<NotificationDevicePrefs>) => {
    const next = { ...readNotificationPrefs(), ...patch };
    writeNotificationPrefs(next);
    setPrefs(next);
  }, []);

  return { prefs, update, ready };
}
