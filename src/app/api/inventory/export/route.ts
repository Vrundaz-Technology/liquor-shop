import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import { canAccessLocation } from "@/lib/auth/location-access";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import { fetchInventoryState } from "@/lib/db/queries";
import { nullableMoneySchema } from "@/lib/validation/money";
import { z } from "zod";
import {
  buildInventoryCsv,
  buildInventoryXlsx,
  mapDbExportRow,
  parseInventoryCsv,
  parseInventoryXlsx,
  type InventoryImportPatch,
} from "@/lib/inventory-spreadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("inventory.view");
  if (auth.error) return auth.error;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureOrganizationSchema();
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const format = (searchParams.get("format") || "csv").toLowerCase();
  const category = (searchParams.get("category") || "all").trim().toLowerCase();
  const status = (searchParams.get("status") || "all").trim().toLowerCase();
  const q = (searchParams.get("q") || "").trim();

  if (!locationId || !canAccessLocation(auth.user, locationId)) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "format must be csv or xlsx" }, { status: 400 });
  }
  if (!["all", "ok", "low", "out"].includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, shortName: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Keep status bands aligned with inventory UI (REORDER_POINT = 3).
  const REORDER_POINT = 3;
  const params: unknown[] = [locationId];
  const where: string[] = [`li.location_id = ?`];

  if (category && category !== "all") {
    params.push(category);
    where.push(`p.category_slug = ?`);
  }
  if (q) {
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    where.push(`(p.name LIKE ? OR p.brand LIKE ? OR COALESCE(p.sku, '') LIKE ?)`);
  }
  if (status === "out") {
    where.push(`li.on_hand <= 0`);
  } else if (status === "low") {
    params.push(REORDER_POINT);
    where.push(`li.on_hand > 0 AND li.on_hand <= ?`);
  } else if (status === "ok") {
    params.push(REORDER_POINT);
    where.push(`li.on_hand > ?`);
  }

  const rows = await prisma.$queryRawUnsafe<
    {
      product_id: string;
      sku: string | null;
      upc: string | null;
      name: string;
      brand: string;
      on_hand: number;
      reserved: number;
      base_price: unknown;
      sale_price: unknown;
      cost_price: unknown;
      promo_price: unknown;
      hidden: boolean;
    }[]
  >(
    `SELECT li.product_id, p.sku, p.upc, p.name, p.brand,
            CAST(li.on_hand AS SIGNED) AS on_hand,
            CAST(COALESCE(li.reserved, 0) AS SIGNED) AS reserved,
            li.base_price, li.sale_price, li.cost_price, li.promo_price,
            COALESCE(li.hidden, false) AS hidden
     FROM location_inventory li
     INNER JOIN products p ON p.id = li.product_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.name ASC`,
    ...params,
  );

  const exportRows = rows.map(mapDbExportRow);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = location.shortName.replace(/[^\w.-]+/g, "-").toLowerCase() || locationId;
  const filtered =
    (category && category !== "all") ||
    (status && status !== "all") ||
    Boolean(q);

  await recordActivity({
    actorUserId: auth.user.id,
    action: "inventory.export",
    entityType: "inventory",
    entityId: locationId,
    locationId,
    summary: `${auth.user.name} exported inventory (${format.toUpperCase()}${filtered ? ", filtered" : ""}) for ${location.shortName}`,
    metadata: activityChanges(
      [
        { field: "format", to: format },
        { field: "rows", to: exportRows.length },
        { field: "filtered", to: filtered ? "Yes" : "No" },
        ...(category && category !== "all" ? [{ field: "category", to: category }] : []),
        ...(status && status !== "all" ? [{ field: "status", to: status }] : []),
      ],
      { q: q || undefined },
    ),
  });

  const suffix = filtered ? `-filtered-${exportRows.length}` : "";
  if (format === "xlsx") {
    const buffer = await buildInventoryXlsx(exportRows);
    const filename = `inventory-${safeName}${suffix}-${stamp}.xlsx`;
    return new NextResponse(Uint8Array.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  }

  const csv = buildInventoryCsv(exportRows);
  const csvName = `inventory-${safeName}${suffix}-${stamp}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvName}"; filename*=UTF-8''${encodeURIComponent(csvName)}`,
      "Cache-Control": "no-store",
    },
  });
}

const jsonImportSchema = z.object({
  locationId: z.string().min(1),
  rows: z.array(
    z.object({
      productId: z.string().min(1).optional(),
      sku: z.string().min(1).optional(),
      onHand: z.number().int().min(0).optional(),
      basePrice: nullableMoneySchema.optional(),
      salePrice: nullableMoneySchema.optional(),
      costPrice: nullableMoneySchema.optional(),
      promoPrice: nullableMoneySchema.optional(),
      hidden: z.boolean().optional(),
    }),
  ),
});

async function resolveProductId(patch: InventoryImportPatch): Promise<string | null> {
  if (patch.productId) {
    const byId = await prisma.product.findUnique({
      where: { id: patch.productId },
      select: { id: true },
    });
    if (byId) return byId.id;
  }
  if (patch.sku) {
    const bySku = await prisma.product.findFirst({
      where: { sku: patch.sku },
      select: { id: true },
    });
    if (bySku) return bySku.id;
  }
  return null;
}

async function applyImportRows(locationId: string, rows: InventoryImportPatch[]) {
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const productId = await resolveProductId(row);
    if (!productId) {
      skipped += 1;
      errors.push(`Row ${index + 1}: product not found`);
      continue;
    }

    const data: {
      onHand?: number;
      basePrice?: number | null;
      salePrice?: number | null;
      costPrice?: number | null;
      promoPrice?: number | null;
      hidden?: boolean;
    } = {};
    if (row.onHand != null) data.onHand = row.onHand;
    if (row.basePrice !== undefined) data.basePrice = row.basePrice;
    if (row.salePrice !== undefined) data.salePrice = row.salePrice;
    if (row.costPrice !== undefined) data.costPrice = row.costPrice;
    if (row.promoPrice !== undefined) data.promoPrice = row.promoPrice;
    if (row.hidden !== undefined) data.hidden = row.hidden;
    if (!Object.keys(data).length) {
      skipped += 1;
      continue;
    }

    try {
      await prisma.locationInventory.update({
        where: {
          locationId_productId: { locationId, productId },
        },
        data,
      });
      updated += 1;
    } catch {
      skipped += 1;
      errors.push(`Row ${index + 1}: no inventory row for product`);
    }
  }

  return { updated, skipped, errors: errors.slice(0, 12) };
}

export async function POST(request: Request) {
  const auth = await requirePermission("inventory.adjust");
  if (auth.error) return auth.error;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;

  const contentType = request.headers.get("content-type") || "";
  let locationId = "";
  let rows: InventoryImportPatch[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    locationId = String(form.get("locationId") || "").trim();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      rows = await parseInventoryXlsx(buffer);
    } else if (name.endsWith(".csv") || file.type.includes("csv") || file.type.includes("text")) {
      rows = parseInventoryCsv(buffer.toString("utf8"));
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .csv or .xlsx." },
        { status: 400 },
      );
    }
  } else {
    const body = jsonImportSchema.safeParse(await request.json());
    if (!body.success) {
      const message = body.error.issues[0]?.message ?? "Invalid import payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    locationId = body.data.locationId;
    rows = body.data.rows;
  }

  if (!locationId || !canAccessLocation(auth.user, locationId)) {
    return NextResponse.json({ error: "No access to this store" }, { status: 403 });
  }

  const loc = await prisma.$queryRawUnsafe<{ id: string; organization_id: string | null }[]>(
    `SELECT id, organization_id FROM locations WHERE id = ? LIMIT 1`,
    locationId,
  );
  if (!loc[0] || (loc[0].organization_id && loc[0].organization_id !== orgId)) {
    return NextResponse.json({ error: "Store not found for this organization" }, { status: 404 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "No importable rows found in the file." }, { status: 400 });
  }

  const result = await applyImportRows(locationId, rows);
  const inventory = await fetchInventoryState();

  await recordActivity({
    actorUserId: auth.user.id,
    action: "inventory.import",
    entityType: "inventory",
    entityId: locationId,
    locationId,
    summary: `${auth.user.name} imported inventory (${result.updated} updated, ${result.skipped} skipped)`,
    metadata: activityChanges([
      { field: "rows", to: rows.length },
      { field: "updated", to: result.updated },
      { field: "skipped", to: result.skipped },
    ]),
  });

  return NextResponse.json({
    ok: true,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    inventory,
  });
}
