import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { mePatchSchema } from "@/lib/db/validators";
import { redeemUserLoyaltyPoints, updateUserProfile, fetchUserById } from "@/lib/db/queries";
import { updateOwnPassword, updateOwnProfileFields } from "@/lib/db/users";
import { applyAuthCookies, issueTokens } from "@/lib/auth/session";
import { validatePassword } from "@/lib/auth/password";

export async function GET(request: Request) {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const includeOrders = new URL(request.url).searchParams.get("orders") === "1";
    if (includeOrders) {
      const full = await fetchUserById(user.id);
      return NextResponse.json({ user: full ?? user });
    }
    return NextResponse.json({ user });
  } catch (error) {
    console.error("[GET /api/auth/me]", error);
    return NextResponse.json({ error: "Failed to load auth profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const parsed = mePatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
    }
    if ("redeemPoints" in parsed.data) {
      try {
        const { resolveMemberOrganizationId } = await import("@/lib/db/loyalty");
        const orgId = await resolveMemberOrganizationId({
          preferredBranchId: user.preferredBranchId,
          organizationId: user.organizationId,
        });
        await redeemUserLoyaltyPoints(user.id, parsed.data.redeemPoints, orgId);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Not enough loyalty points." },
          { status: 409 },
        );
      }
      const next = await fetchUserById(user.id);
      return NextResponse.json({ user: next ?? user });
    }

    const { patch } = parsed.data;
    let passwordChanged = false;
    if (patch.password) {
      const passwordError = validatePassword(patch.password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
      if (!patch.currentPassword) {
        return NextResponse.json(
          { error: "Enter your current password to change it." },
          { status: 400 },
        );
      }
      try {
        await updateOwnPassword(user.id, patch.password, patch.currentPassword);
        passwordChanged = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not update password.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    const { password: _unusedPassword, currentPassword: _unusedCurrent, ...profilePatch } = patch;
    void _unusedPassword;
    void _unusedCurrent;
    const extrasPatch = {
      ...(profilePatch.name ? { name: profilePatch.name } : {}),
      ...(profilePatch.email ? { email: profilePatch.email } : {}),
      ...(profilePatch.avatarUrl !== undefined ? { avatarUrl: profilePatch.avatarUrl } : {}),
      ...(profilePatch.birthday !== undefined
        ? { birthday: profilePatch.birthday === "" ? null : profilePatch.birthday }
        : {}),
      ...(profilePatch.preferences !== undefined ? { preferences: profilePatch.preferences } : {}),
    };
    if (Object.keys(extrasPatch).length > 0) {
      const extraResult = await updateOwnProfileFields(user.id, extrasPatch);
      if (extraResult.error) {
        return NextResponse.json({ error: extraResult.error }, { status: extraResult.status ?? 400 });
      }
    }
    const restPatch = {
      ...(profilePatch.preferredBranchId
        ? { preferredBranchId: profilePatch.preferredBranchId }
        : {}),
      ...(profilePatch.recentlyViewed ? { recentlyViewed: profilePatch.recentlyViewed } : {}),
      ...(profilePatch.addresses ? { addresses: profilePatch.addresses } : {}),
    };
    if (Object.keys(restPatch).length > 0) {
      await updateUserProfile(user.id, restPatch);
    }
    const next = await fetchUserById(user.id);
    const payload = next ?? user;
    const res = NextResponse.json({ user: payload });
    // Re-issue JWTs when identity or password changes so claims stay fresh.
    if (passwordChanged || extrasPatch.email || extrasPatch.name) {
      const tokens = await issueTokens({
        sub: payload.id,
        email: payload.email,
        role: payload.role,
      });
      return applyAuthCookies(res, tokens);
    }
    return res;
  } catch (error) {
    console.error("[PATCH /api/auth/me]", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
