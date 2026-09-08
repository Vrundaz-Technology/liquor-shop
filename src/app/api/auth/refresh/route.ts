import { NextResponse } from "next/server";
import { fetchUserById } from "@/lib/db/queries";
import {
  applyAuthCookies,
  authConfigErrorResponse,
  clearAuthCookies,
  issueTokens,
  readRefreshTokenFromRequest,
  verifyRefreshToken,
} from "@/lib/auth/session";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`refresh:${clientIp(request)}`, { limit: 60, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many token refresh attempts.");
    }

    const raw = await readRefreshTokenFromRequest();
    if (!raw) {
      return clearAuthCookies(
        NextResponse.json({ error: "Refresh token missing. Sign in again." }, { status: 401 }),
      );
    }

    const refresh = await verifyRefreshToken(raw);
    if (!refresh) {
      return clearAuthCookies(
        NextResponse.json({ error: "Refresh token invalid or expired." }, { status: 401 }),
      );
    }

    const user = await fetchUserById(refresh.sub);
    if (!user || user.active === false) {
      return clearAuthCookies(
        NextResponse.json({ error: "Account is not available." }, { status: 401 }),
      );
    }

    const tokens = await issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const res = NextResponse.json({
      accessToken: tokens.accessToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      user,
    });
    return applyAuthCookies(res, tokens);
  } catch (error) {
    const misconfigured = authConfigErrorResponse(error);
    if (misconfigured) {
      console.error("[POST /api/auth/refresh] auth misconfigured", error);
      return misconfigured;
    }
    console.error("[POST /api/auth/refresh]", error);
    return NextResponse.json({ error: "Token refresh failed." }, { status: 500 });
  }
}
