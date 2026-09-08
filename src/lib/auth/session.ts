import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

/** Short-lived access JWT (Bearer + httpOnly cookie). */
export const ACCESS_COOKIE = "sams_access";
/** Long-lived refresh JWT (httpOnly; used only to mint new access tokens). */
export const REFRESH_COOKIE = "sams_refresh";
/** Legacy single-session cookie — cleared on logout / login. */
export const LEGACY_SESSION_COOKIE = "sams_session";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export type AuthClaims = {
  sub: string;
  email: string;
  role: string;
};

export type AccessTokenClaims = AuthClaims & { typ: "access"; jti: string };
export type RefreshTokenClaims = AuthClaims & { typ: "refresh"; jti: string };

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

/**
 * Raised when server auth configuration is missing or invalid.
 *
 * This is an operator problem, not a user problem, so callers surface it as a
 * 503 with the cause named rather than an opaque 500 that can only be diagnosed
 * from server logs.
 */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

const DEV_SECRET_FALLBACK = "liquor-shop-dev-auth-secret-2026";
const MIN_SECRET_LENGTH = 32;

/** Describes why AUTH_SECRET is unusable in production, or null when it is fine. */
export function authSecretProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  const secret = env.AUTH_SECRET || "";
  if (!secret) return "AUTH_SECRET is not set on this deployment.";
  if (secret === DEV_SECRET_FALLBACK) {
    return "AUTH_SECRET is still the built-in development value and must be replaced in production.";
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return `AUTH_SECRET is ${secret.length} characters; it must be at least ${MIN_SECRET_LENGTH}.`;
  }
  return null;
}

function secretKey() {
  const problem = authSecretProblem();
  if (problem) throw new AuthConfigError(problem);
  return new TextEncoder().encode(process.env.AUTH_SECRET || DEV_SECRET_FALLBACK);
}

/**
 * Turns an auth-configuration failure into a 503 naming the misconfigured
 * variable. Returns null for every other error so callers keep their own
 * handling. The message names an environment variable, never its value.
 */
export function authConfigErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AuthConfigError)) return null;
  return NextResponse.json(
    {
      error: "Sign-in is unavailable: server authentication is misconfigured.",
      detail: error.message,
    },
    { status: 503 },
  );
}

function cookieBase(path = "/") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path,
  };
}

function isRole(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Shared across Next.js route bundles (module maps are not always singletons). */
const globalRevoked = globalThis as typeof globalThis & {
  __samsRevokedAccess?: Map<string, number>;
};
function revokedAccess() {
  if (!globalRevoked.__samsRevokedAccess) {
    globalRevoked.__samsRevokedAccess = new Map();
  }
  return globalRevoked.__samsRevokedAccess;
}

function pruneRevoked(now = Date.now()) {
  for (const [jti, exp] of revokedAccess()) {
    if (exp <= now) revokedAccess().delete(jti);
  }
}

export function revokeAccessToken(jti: string, expiresAtMs: number) {
  const map = revokedAccess();
  if (map.size > 5_000) pruneRevoked();
  map.set(jti, expiresAtMs);
}

export function isAccessTokenRevoked(jti: string) {
  const map = revokedAccess();
  const exp = map.get(jti);
  if (!exp) return false;
  if (Date.now() >= exp) {
    map.delete(jti);
    return false;
  }
  return true;
}

export async function signAccessToken(claims: AuthClaims) {
  const jti = crypto.randomUUID();
  return new SignJWT({
    email: claims.email,
    role: claims.role,
    typ: "access",
    jti,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function signRefreshToken(claims: AuthClaims) {
  const jti = crypto.randomUUID();
  return new SignJWT({
    email: claims.email,
    role: claims.role,
    typ: "refresh",
    jti,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function issueTokens(claims: AuthClaims): Promise<IssuedTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(claims),
    signRefreshToken(claims),
  ]);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string" || !isRole(payload.role)) {
      return null;
    }
    // Accept legacy cookies that were JWTs without typ (migrated away from "session").
    if (payload.typ && payload.typ !== "access") return null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) {
      // Legacy tokens without jti: allow until natural expiry, then disappear.
      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        typ: "access",
        jti: "legacy",
      };
    }
    if (isAccessTokenRevoked(jti)) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      typ: "access",
      jti,
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      !isRole(payload.role) ||
      payload.typ !== "refresh"
    ) {
      return null;
    }
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      typ: "refresh",
      jti,
    };
  } catch {
    return null;
  }
}

/** Prefer Authorization: Bearer, then access cookie, then legacy session cookie. */
export async function readAccessTokenFromRequest(): Promise<string | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value || jar.get(LEGACY_SESSION_COOKIE)?.value || null;
}

export async function readRefreshTokenFromRequest(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value || null;
}

export async function getAuthClaims(): Promise<AccessTokenClaims | null> {
  const token = await readAccessTokenFromRequest();
  if (!token) return null;
  return verifyAccessToken(token);
}

export function applyAuthCookies(res: NextResponse, tokens: IssuedTokens) {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieBase(),
    maxAge: ACCESS_TTL_SECONDS,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieBase("/"),
    maxAge: REFRESH_TTL_SECONDS,
  });
  // Drop legacy opaque-looking session cookie name.
  res.cookies.set(LEGACY_SESSION_COOKIE, "", {
    ...cookieBase(),
    maxAge: 0,
    expires: new Date(0),
  });
  res.cookies.delete(LEGACY_SESSION_COOKIE);
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  const expired = { maxAge: 0, expires: new Date(0) };
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieBase(), ...expired });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieBase("/"), ...expired });
  res.cookies.set(LEGACY_SESSION_COOKIE, "", { ...cookieBase(), ...expired });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(LEGACY_SESSION_COOKIE);
  return res;
}

export async function attachAuth(
  res: NextResponse,
  claims: AuthClaims,
): Promise<{ response: NextResponse; tokens: IssuedTokens }> {
  const tokens = await issueTokens(claims);
  return { response: applyAuthCookies(res, tokens), tokens };
}

// ── Backward-compatible aliases (call sites migrating off "session" naming) ──

/** @deprecated Use ACCESS_COOKIE / REFRESH_COOKIE */
export const SESSION_COOKIE = ACCESS_COOKIE;
/** @deprecated Use AuthClaims */
export type SessionPayload = AuthClaims;

/** @deprecated Use getAuthClaims */
export async function getSession() {
  return getAuthClaims();
}

/** @deprecated Use attachAuth */
export async function writeSessionCookie(res: NextResponse, payload: AuthClaims) {
  const { response } = await attachAuth(res, payload);
  return response;
}

/** @deprecated Use clearAuthCookies */
export function expireSessionCookie(res: NextResponse) {
  return clearAuthCookies(res);
}
