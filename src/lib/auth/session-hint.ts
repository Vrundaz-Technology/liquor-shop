import type { UserProfile } from "@/types";

export const AUTH_HINT_COOKIE = "sams_auth";
const SESSION_SKETCH_KEY = "sams_session_sketch";

type SessionSketch = Pick<
  UserProfile,
  "id" | "name" | "email" | "role" | "avatarUrl" | "preferredBranchId" | "loyaltyPoints" | "loyaltyTier"
>;

export function hasAuthHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${AUTH_HINT_COOKIE}=`));
}

export function readSessionSketch(): SessionSketch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_SKETCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionSketch>;
    if (!parsed.id || !parsed.email || !parsed.role || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      avatarUrl: parsed.avatarUrl,
      preferredBranchId: parsed.preferredBranchId ?? "loc1",
      loyaltyPoints: typeof parsed.loyaltyPoints === "number" ? parsed.loyaltyPoints : 0,
      loyaltyTier: parsed.loyaltyTier ?? "Member",
    };
  } catch {
    return null;
  }
}

export function writeSessionSketch(user: UserProfile) {
  if (typeof window === "undefined") return;
  try {
    const sketch: SessionSketch = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      preferredBranchId: user.preferredBranchId,
      loyaltyPoints: user.loyaltyPoints,
      loyaltyTier: user.loyaltyTier,
    };
    window.sessionStorage.setItem(SESSION_SKETCH_KEY, JSON.stringify(sketch));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSessionSketch() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_SKETCH_KEY);
  } catch {
    /* ignore */
  }
}
