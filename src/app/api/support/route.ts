import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth/require";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import {
  addSupportMessage,
  createSupportTicket,
  getSupportTicketById,
  listCustomerTickets,
  listStaffTickets,
  supportTrends,
  updateSupportTicket,
} from "@/lib/db/support-admin";
import { canAccessLocation } from "@/lib/auth/location-access";

const categoryEnum = z.enum([
  "order_issue",
  "missing_item",
  "damaged_product",
  "delivery_issue",
  "refund",
  "payment",
  "account",
  "product_question",
]);

const createSchema = z.object({
  action: z.literal("create").optional(),
  category: categoryEnum,
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(8).max(5000),
  orderId: z.string().min(1).optional().nullable(),
  locationId: z.string().min(1).optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).optional(),
});

const replySchema = z.object({
  action: z.literal("reply"),
  ticketId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});

const staffUpdateSchema = z.object({
  action: z.literal("update"),
  ticketId: z.string().min(1),
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  assigneeUserId: z.string().min(1).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const staff = searchParams.get("staff") === "1";
    const trends = searchParams.get("trends") === "1";
    const ticketId = searchParams.get("id");

    if (staff || trends) {
      const auth = await requirePermission("support.view");
      if (auth.error) return auth.error;

      if (trends) {
        const locationId = searchParams.get("locationId");
        const loc =
          locationId && canAccessLocation(auth.user, locationId) ? locationId : null;
        return NextResponse.json({ trends: await supportTrends(auth.user, loc) });
      }

      if (ticketId) {
        const ticket = await getSupportTicketById(ticketId, { actor: auth.user });
        return NextResponse.json({ ticket });
      }

      const tickets = await listStaffTickets({
        actor: auth.user,
        status: (searchParams.get("status") as "open" | "all") ?? "all",
        category: (searchParams.get("category") as "order_issue" | "all") ?? "all",
        scope: (searchParams.get("scope") as "store" | "all") ?? "all",
        locationId: searchParams.get("locationId") ?? "all",
        q: searchParams.get("q") ?? undefined,
      });
      return NextResponse.json({ tickets });
    }

    const { user, error } = await requireUser();
    if (error) return error;

    if (ticketId) {
      const ticket = await getSupportTicketById(ticketId, { forUserId: user.id });
      return NextResponse.json({ ticket });
    }

    const tickets = await listCustomerTickets(user.id);
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("[GET /api/support]", error);
    const message = error instanceof Error ? error.message : "Failed to load support.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "reply") {
      const parsed = replySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid reply." }, { status: 400 });
      }

      // Staff reply if they have support.manage; otherwise customer on own ticket
      const staffAuth = await requirePermission("support.manage");
      if (!staffAuth.error) {
        const ticket = await addSupportMessage({
          ticketId: parsed.data.ticketId,
          author: staffAuth.user,
          body: parsed.data.body,
          asStaff: true,
        });
        await recordActivity({
          actorUserId: staffAuth.user.id,
          action: "support.reply",
          entityType: "support",
          entityId: ticket.id,
          locationId: ticket.locationId,
          summary: `${staffAuth.user.name} replied to ticket ${ticket.id}`,
          metadata: activityChanges([
            { field: "reply", to: "staff reply" },
            { field: "status", to: ticket.status },
          ]),
        });
        return NextResponse.json({ ok: true, ticket });
      }

      const { user, error } = await requireUser();
      if (error) return error;
      const ticket = await addSupportMessage({
        ticketId: parsed.data.ticketId,
        author: user,
        body: parsed.data.body,
        asStaff: false,
      });
      void (async () => {
        try {
          const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
          await emitStaffNotification({
            organizationId: ticket.organizationId,
            type: "support.customer_reply",
            title: "Customer replied on support",
            body: `${ticket.subject} · ${ticket.id}`,
            entityType: "support",
            entityId: ticket.id,
            locationId: ticket.locationId,
            actorUserId: user.id,
            severity: "attention",
            dedupeKey: `support.reply:${ticket.id}:${Date.now()}`,
            href: "/dashboard/support",
          });
        } catch (error) {
          console.error("[support reply staff notify]", error);
        }
      })();
      return NextResponse.json({ ok: true, ticket });
    }

    if (body?.action === "update") {
      const auth = await requirePermission("support.manage");
      if (auth.error) return auth.error;
      const parsed = staffUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid update." }, { status: 400 });
      }
      const previous = await getSupportTicketById(parsed.data.ticketId, { actor: auth.user });
      const ticket = await updateSupportTicket({
        ticketId: parsed.data.ticketId,
        actor: auth.user,
        status: parsed.data.status,
        priority: parsed.data.priority,
        assigneeUserId: parsed.data.assigneeUserId,
      });
      const changes = onlyChanged([
        {
          field: "status",
          from: previous.status,
          to: ticket.status,
        },
        {
          field: "priority",
          from: previous.priority,
          to: ticket.priority,
        },
        {
          field: "assignee",
          from: previous.assigneeUserId ?? "(unassigned)",
          to: ticket.assigneeUserId ?? "(unassigned)",
        },
      ]);
      if (changes.length) {
        await recordActivity({
          actorUserId: auth.user.id,
          action: "support.ticket_updated",
          entityType: "support",
          entityId: ticket.id,
          locationId: ticket.locationId,
          summary: `${auth.user.name} updated ticket ${ticket.id}`,
          metadata: activityChanges(changes),
        });
      }
      return NextResponse.json({ ok: true, ticket });
    }

    const { user, error } = await requireUser();
    if (error) return error;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid ticket." },
        { status: 400 },
      );
    }

    const ticket = await createSupportTicket({
      user,
      category: parsed.data.category,
      subject: parsed.data.subject,
      body: parsed.data.body,
      orderId: parsed.data.orderId,
      locationId: parsed.data.locationId,
      priority: parsed.data.priority,
    });

    await recordActivity({
      actorUserId: user.id,
      action: "support.ticket_created",
      entityType: "support",
      entityId: ticket.id,
      locationId: ticket.locationId,
      summary: `${user.name} opened support ticket ${ticket.id}`,
      metadata: activityChanges([
        { field: "created", to: ticket.subject },
        { field: "category", to: ticket.category },
        { field: "priority", to: ticket.priority },
        { field: "status", to: ticket.status },
        ...(ticket.locationId ? [{ field: "location", to: ticket.locationId }] : []),
      ]),
    });

    void (async () => {
      try {
        const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
        await emitStaffNotification({
          organizationId: ticket.organizationId,
          type: "support.ticket_created",
          title: "New support ticket",
          body: `${ticket.category.replace(/_/g, " ")} · ${ticket.subject}`,
          entityType: "support",
          entityId: ticket.id,
          locationId: ticket.locationId,
          actorUserId: user.id,
          severity: "attention",
          dedupeKey: `support.ticket_created:${ticket.id}`,
          href: "/dashboard/support",
          metadata: { category: ticket.category, routeScope: ticket.routeScope },
        });
      } catch (error) {
        console.error("[support create staff notify]", error);
      }
    })();

    return NextResponse.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/support]", error);
    const message = error instanceof Error ? error.message : "Failed to save ticket.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
