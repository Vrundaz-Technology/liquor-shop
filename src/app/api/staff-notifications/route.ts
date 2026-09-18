import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/require";
import {
  clearStaffNotifications,
  countUnreadStaffNotifications,
  listStaffNotificationsForUser,
  markStaffNotificationsRead,
} from "@/lib/db/staff-notifications";

const idsSchema = z.array(z.string().min(1)).min(1).max(100);

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: idsSchema }),
  z.object({ clear: z.literal(true) }),
  z.object({ clearIds: idsSchema }),
]);

export async function GET(request: Request) {
  try {
    const auth = await requireStaff();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    if (searchParams.get("count") === "1") {
      const unread = await countUnreadStaffNotifications(auth.user);
      return NextResponse.json({ ok: true, unread });
    }

    const unreadOnly = searchParams.get("unreadOnly") === "1";
    const limit = Number(searchParams.get("limit") ?? "20");
    const items = await listStaffNotificationsForUser(auth.user, {
      limit: Number.isFinite(limit) ? limit : 20,
      unreadOnly,
    });
    const unread = await countUnreadStaffNotifications(auth.user);
    return NextResponse.json({ ok: true, items, unread });
  } catch (error) {
    console.error("[GET /api/staff-notifications]", error);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff();
    if (auth.error) return auth.error;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload." }, { status: 400 });
    }

    const body = parsed.data;
    const updated =
      "clear" in body
        ? await clearStaffNotifications(auth.user, { all: true })
        : "clearIds" in body
          ? await clearStaffNotifications(auth.user, { ids: body.clearIds })
          : await markStaffNotificationsRead(auth.user, body);
    const unread = await countUnreadStaffNotifications(auth.user);
    return NextResponse.json({ ok: true, updated, unread });
  } catch (error) {
    console.error("[POST /api/staff-notifications]", error);
    return NextResponse.json({ error: "Could not update notifications." }, { status: 500 });
  }
}
