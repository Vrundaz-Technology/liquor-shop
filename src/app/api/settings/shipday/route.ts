import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require";
import {
  getShipdaySettingsPublic,
  saveOrgShipdaySecrets,
} from "@/lib/db/dispatch-settings";

const patchSchema = z.object({
  apiKey: z.string().max(200).optional(),
  webhookSecret: z.string().max(64).optional(),
});

export async function GET() {
  const { user, error } = await requirePermission("deliveries.manage");
  if (error) return error;
  try {
    const settings = await getShipdaySettingsPublic(user);
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[GET /api/settings/shipday]", err);
    return NextResponse.json({ error: "Failed to load Shipday settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requirePermission("deliveries.manage");
  if (error) return error;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Shipday settings." }, { status: 400 });
    }
    const settings = await saveOrgShipdaySecrets(user, parsed.data);
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[PATCH /api/settings/shipday]", err);
    return NextResponse.json({ error: "Failed to save Shipday settings." }, { status: 500 });
  }
}
