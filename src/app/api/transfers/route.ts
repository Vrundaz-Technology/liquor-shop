import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { createAndCompleteTransfer, listTransfers } from "@/lib/db/transfers";
import { z } from "zod";

export async function GET() {
  const auth = await requirePermission("inventory.view");
  if (auth.error) return auth.error;
  const transfers = await listTransfers(auth.user);
  return NextResponse.json({ ok: true, transfers });
}

const postSchema = z
  .object({
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    notes: z.string().max(2000).optional(),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive().max(100_000),
        }),
      )
      .min(1),
  })
  .refine((data) => data.fromLocationId !== data.toLocationId, {
    message: "From and To stores must be different",
    path: ["toLocationId"],
  });

export async function POST(request: Request) {
  const auth = await requirePermission("inventory.transfer");
  if (auth.error) return auth.error;

  const body = postSchema.safeParse(await request.json());
  if (!body.success) {
    const message = body.error.issues[0]?.message ?? "Invalid transfer";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const id = await createAndCompleteTransfer({
      actor: auth.user,
      ...body.data,
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transfer failed" },
      { status: 400 },
    );
  }
}
