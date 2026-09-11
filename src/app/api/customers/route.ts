import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { listOrganizationCustomers, listCustomerOrders, updateCustomerNotes, getCustomerCrmSnapshot } from "@/lib/db/crm";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import { z } from "zod";

export async function GET(request: Request) {
  const auth = await requirePermission("customers.view");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  if (customerId) {
    const orders = await listCustomerOrders(auth.user, customerId, Number(searchParams.get("limit") ?? 25));
    return NextResponse.json({ ok: true, orders });
  }

  const customers = await listOrganizationCustomers(auth.user, {
    segment: searchParams.get("segment") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    limit: Number(searchParams.get("limit") ?? 100),
  });
  return NextResponse.json({ ok: true, customers });
}

const patchSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().max(5000, "Notes must be 5000 characters or less").optional(),
  marketingConsent: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requirePermission("customers.edit");
  if (auth.error) return auth.error;

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    const message = body.error.issues[0]?.message ?? "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const previous = await getCustomerCrmSnapshot(auth.user, body.data.customerId);
  const nextNotes = body.data.notes ?? previous?.notes ?? "";
  const nextConsent =
    body.data.marketingConsent !== undefined
      ? body.data.marketingConsent
      : (previous?.marketingConsent ?? false);

  await updateCustomerNotes(
    auth.user,
    body.data.customerId,
    nextNotes,
    body.data.marketingConsent,
  );

  const changes = onlyChanged([
    {
      field: "notes",
      from: previous?.notes ?? "",
      to: nextNotes,
    },
    {
      field: "marketingConsent",
      from: previous?.marketingConsent ? "Opted in" : "Opted out",
      to: nextConsent ? "Opted in" : "Opted out",
    },
  ]);

  if (changes.length) {
    await recordActivity({
      actorUserId: auth.user.id,
      action: "crm.updated",
      entityType: "customer",
      entityId: body.data.customerId,
      summary: `${auth.user.name} updated CRM notes for customer ${body.data.customerId}`,
      metadata: activityChanges(changes),
    });
  }

  return NextResponse.json({ ok: true });
}
