import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/db/users";
import { recordActivity } from "@/lib/db/activity";
import { loginSchema } from "@/lib/db/validators";
import { applyAuthCookies, authConfigErrorResponse, issueTokens } from "@/lib/auth/session";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`login:${clientIp(request)}`, { limit: 20, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many sign-in attempts. Try again shortly.");
    }
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const result = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!result.user) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const user = result.user;
    // Audit logging is best-effort: a failed activity write must never block a
    // sign-in that has already been authenticated.
    try {
      await recordActivity({
        actorUserId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        summary: `${user.name} signed in as ${user.role}`,
      });
    } catch (activityError) {
      console.error("[POST /api/auth/login] activity log write failed", activityError);
    }
    const tokens = await issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const res = NextResponse.json({
      user,
      accessToken: tokens.accessToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
    });
    return applyAuthCookies(res, tokens);
  } catch (error) {
    const misconfigured = authConfigErrorResponse(error);
    if (misconfigured) {
      console.error("[POST /api/auth/login] auth misconfigured", error);
      return misconfigured;
    }
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
