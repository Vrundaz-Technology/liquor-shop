export const NOTIFICATION_PREFS_KEY = "sams.notifications.device";
export const NOTIFICATION_PREFS_EVENT = "sams:notification-prefs";

export type BuiltinNotificationSoundId = "chime" | "bell" | "ping" | "pop";

export type CustomNotificationSound = {
  id: string;
  name: string;
  dataUrl: string;
};

export type NotificationDevicePrefs = {
  /** When false, hide the unread badge and skip sounds. Inbox still loads. */
  enabled: boolean;
  autoMarkRead: boolean;
  soundEnabled: boolean;
  soundId: string;
  customSounds: CustomNotificationSound[];
};

export const BUILTIN_NOTIFICATION_SOUNDS: {
  id: BuiltinNotificationSoundId;
  name: string;
  src: string;
}[] = [
  { id: "chime", name: "Chime — Two rising bells", src: "/sounds/chime.wav" },
  { id: "bell", name: "Bell — Single ring", src: "/sounds/bell.wav" },
  { id: "ping", name: "Ping — Soft alert", src: "/sounds/ping.wav" },
  { id: "pop", name: "Pop — Short tap", src: "/sounds/pop.wav" },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationDevicePrefs = {
  enabled: true,
  autoMarkRead: false,
  soundEnabled: true,
  soundId: "chime",
  customSounds: [],
};

const MAX_CUSTOM = 8;
const MAX_CUSTOM_BYTES = 450_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseNotificationPrefs(raw: unknown): NotificationDevicePrefs {
  if (!isRecord(raw)) return { ...DEFAULT_NOTIFICATION_PREFS };
  const customSounds = Array.isArray(raw.customSounds)
    ? raw.customSounds
        .filter(isRecord)
        .map((row) => ({
          id: String(row.id ?? "").slice(0, 80),
          name: String(row.name ?? "Custom sound").slice(0, 80),
          dataUrl: String(row.dataUrl ?? ""),
        }))
        .filter((row) => row.id && row.dataUrl.startsWith("data:audio/"))
        .slice(0, MAX_CUSTOM)
    : [];
  const soundId = String(raw.soundId ?? DEFAULT_NOTIFICATION_PREFS.soundId);
  return {
    enabled: raw.enabled !== false,
    autoMarkRead: raw.autoMarkRead === true,
    soundEnabled: raw.soundEnabled !== false,
    soundId,
    customSounds,
  };
}

export function readNotificationPrefs(): NotificationDevicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    return parseNotificationPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function writeNotificationPrefs(prefs: NotificationDevicePrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(NOTIFICATION_PREFS_EVENT));
}

export function notificationSoundSrc(prefs: NotificationDevicePrefs): string | null {
  const builtin = BUILTIN_NOTIFICATION_SOUNDS.find((s) => s.id === prefs.soundId);
  if (builtin) return builtin.src;
  const custom = prefs.customSounds.find((s) => s.id === prefs.soundId);
  return custom?.dataUrl ?? BUILTIN_NOTIFICATION_SOUNDS[0].src;
}

export function soundOptions(prefs: NotificationDevicePrefs) {
  return [
    ...BUILTIN_NOTIFICATION_SOUNDS.map((s) => ({ value: s.id, label: s.name })),
    ...prefs.customSounds.map((s) => ({ value: s.id, label: s.name })),
  ];
}

let unlockAttempted = false;
let lastPlayedAt = 0;

export function unlockNotificationAudio() {
  if (typeof window === "undefined" || unlockAttempted) return;
  unlockAttempted = true;
  const el = new Audio(BUILTIN_NOTIFICATION_SOUNDS[0].src);
  el.volume = 0.01;
  void el
    .play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
    })
    .catch(() => {
      unlockAttempted = false;
    });
}

export function playNotificationSound(
  prefs: NotificationDevicePrefs = readNotificationPrefs(),
  opts?: { force?: boolean },
) {
  if (typeof window === "undefined") return;
  if (!opts?.force && (!prefs.enabled || !prefs.soundEnabled)) return;
  const now = Date.now();
  if (!opts?.force && now - lastPlayedAt < 1200) return;
  lastPlayedAt = now;
  const src = notificationSoundSrc(prefs);
  if (!src) return;
  const el = new Audio(src);
  el.volume = 0.72;
  void el.play().catch(() => {
    /* Browsers block until a click — Preview / first click unlocks. */
  });
}

export async function customSoundFromFile(file: File): Promise<CustomNotificationSound> {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Choose an audio file (WAV, MP3, or OGG).");
  }
  if (file.size > MAX_CUSTOM_BYTES) {
    throw new Error("Keep custom sounds under 450 KB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith("data:audio/")) {
    throw new Error("That file is not a usable audio clip.");
  }
  const base = file.name.replace(/\.[^.]+$/, "").trim() || "Custom sound";
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: base.slice(0, 80),
    dataUrl,
  };
}

export { MAX_CUSTOM };
