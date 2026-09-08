import { NextResponse } from "next/server";
import { signupCustomer } from "@/lib/db/users";
import { signupSchema } from "@/lib/db/validators";
import { applyAuthCookies, authConfigErrorResponse, issueTokens } from "@/lib/auth/session";
import { validatePassword } from "@/lib/auth/password";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`signup:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many sign-up attempts. Try again shortly.");
    }
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }
    const passwordError = validatePassword(parsed.data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    const result = await signupCustomer(parsed.data);
    if (!result.user) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const user = result.user;
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
      console.error("[POST /api/auth/signup] auth misconfigured", error);
      return misconfigured;
    }
    console.error("[POST /api/auth/signup]", error);
    return NextResponse.json({ error: "Sign up failed." }, { status: 500 });
  }
}
