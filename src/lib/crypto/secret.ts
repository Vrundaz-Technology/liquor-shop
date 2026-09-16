import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function material() {
  return process.env.AUTH_SECRET || "liquor-shop-dev-auth-secret-2026";
}

/** Encrypt a short secret (API keys). Empty input returns empty string. */
export function encryptSecret(plain: string): string {
  const value = plain.trim();
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(material()), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(
    ":",
  );
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload || !payload.trim()) return null;
  const parts = payload.trim().split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFromSecret(material()),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 8) return "••••";
  return `${trimmed.slice(0, 2)}••••${trimmed.slice(-4)}`;
}
