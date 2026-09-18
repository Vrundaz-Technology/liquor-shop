import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import {
  getCustomerCrmSnapshot,
  getCustomerProfile,
  listOrganizationCustomers,
  updateCustomerNotes,
} from "@/lib/db/crm";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import { z } from "zod";
import {
  notifyEmailDestinationSchema,
  notifyPhoneDestinationSchema,
} from "@/lib/db/validators";

export async function GET(request: Request) {
  const auth = await requirePermission("customers.view");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  if (customerId) {
    const customer = await getCustomerProfile(auth.user, customerId);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, customer, orders: customer.orders });
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
  marketingEmails: z.boolean().optional(),
  orderEmailUpdates: z.boolean().optional(),
  smsUpdates: z.boolean().optional(),
  pushUpdates: z.boolean().optional(),
  notifyEmails: z.array(notifyEmailDestinationSchema).max(8).optional(),
  notifyPhones: z.array(notifyPhoneDestinationSchema).max(8).optional(),
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
  const nextOrderEmails =
    body.data.orderEmailUpdates !== undefined
      ? body.data.orderEmailUpdates
      : (previous?.orderEmailUpdates ?? true);
  const nextSms =
    body.data.smsUpdates !== undefined ? body.data.smsUpdates : (previous?.smsUpdates ?? true);
  const nextPush =
    body.data.pushUpdates !== undefined ? body.data.pushUpdates : (previous?.pushUpdates ?? false);

  await updateCustomerNotes(auth.user, body.data.customerId, nextNotes, body.data.marketingConsent, {
    emails: body.data.orderEmailUpdates,
    sms: body.data.smsUpdates,
    push: body.data.pushUpdates,
    notifyEmails: body.data.notifyEmails,
    notifyPhones: body.data.notifyPhones,
  });

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
    {
      field: "orderEmails",
      from: previous?.orderEmailUpdates ? "On" : "Off",
      to: nextOrderEmails ? "On" : "Off",
    },
    {
      field: "sms",
      from: previous?.smsUpdates ? "On" : "Off",
      to: nextSms ? "On" : "Off",
    },
    {
      field: "push",
      from: previous?.pushUpdates ? "On" : "Off",
      to: nextPush ? "On" : "Off",
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
