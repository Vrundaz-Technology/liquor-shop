import ExcelJS from "exceljs";
import { moneyNumber } from "@/lib/db/money";

export const INVENTORY_EXPORT_COLUMNS = [
  "product_id",
  "sku",
  "upc",
  "name",
  "brand",
  "on_hand",
  "reserved",
  "available",
  "base_price",
  "sale_price",
  "cost_price",
  "promo_price",
  "hidden",
] as const;

export type InventoryExportColumn = (typeof INVENTORY_EXPORT_COLUMNS)[number];

export type InventoryExportRow = {
  productId: string;
  sku: string;
  upc: string;
  name: string;
  brand: string;
  onHand: number;
  reserved: number;
  available: number;
  basePrice: number | null;
  salePrice: number | null;
  costPrice: number | null;
  promoPrice: number | null;
  hidden: boolean;
};

export type InventoryImportPatch = {
  productId?: string;
  sku?: string;
  onHand?: number;
  basePrice?: number | null;
  salePrice?: number | null;
  costPrice?: number | null;
  promoPrice?: number | null;
  hidden?: boolean;
};

function asNum(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  return moneyNumber(value);
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function moneyCell(value: number | null): string {
  return value == null ? "" : value.toFixed(2);
}

export function toExportCells(row: InventoryExportRow): string[] {
  return [
    row.productId,
    row.sku,
    row.upc,
    row.name,
    row.brand,
    String(row.onHand),
    String(row.reserved),
    String(row.available),
    moneyCell(row.basePrice),
    moneyCell(row.salePrice),
    moneyCell(row.costPrice),
    moneyCell(row.promoPrice),
    row.hidden ? "1" : "0",
  ];
}

export function buildInventoryCsv(rows: InventoryExportRow[]): string {
  const lines = [
    INVENTORY_EXPORT_COLUMNS.join(","),
    ...rows.map((row) => toExportCells(row).map(csvEscape).join(",")),
  ];
  // BOM helps Excel open UTF-8 CSV correctly
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildInventoryXlsx(rows: InventoryExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sam's Discount Liquor";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Inventory", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = INVENTORY_EXPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === "name" ? 36 : key === "product_id" ? 22 : 14,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.commit();

  for (const row of rows) {
    sheet.addRow({
      product_id: row.productId,
      sku: row.sku,
      upc: row.upc,
      name: row.name,
      brand: row.brand,
      on_hand: row.onHand,
      reserved: row.reserved,
      available: row.available,
      base_price: row.basePrice,
      sale_price: row.salePrice,
      cost_price: row.costPrice,
      promo_price: row.promoPrice,
      hidden: row.hidden ? 1 : 0,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** RFC4180-ish CSV parser (supports quoted fields). */
export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseOptionalMoney(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed === "-" || trimmed.toLowerCase() === "null") return null;
  const n = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseOptionalBool(raw: string): boolean | undefined {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (["1", "true", "yes", "y"].includes(trimmed)) return true;
  if (["0", "false", "no", "n"].includes(trimmed)) return false;
  return undefined;
}

function rowFromRecord(record: Record<string, string>): InventoryImportPatch | null {
  const productId = (record.product_id || record.productid || "").trim();
  const sku = (record.sku || "").trim();
  if (!productId && !sku) return null;

  const patch: InventoryImportPatch = {};
  if (productId) patch.productId = productId;
  if (sku) patch.sku = sku;

  const onHand = parseOptionalInt(record.on_hand ?? record.onhand ?? "");
  if (onHand != null) patch.onHand = onHand;

  const basePrice = parseOptionalMoney(record.base_price ?? record.baseprice ?? "");
  if (basePrice !== undefined) patch.basePrice = basePrice;
  const salePrice = parseOptionalMoney(record.sale_price ?? record.saleprice ?? "");
  if (salePrice !== undefined) patch.salePrice = salePrice;
  const costPrice = parseOptionalMoney(record.cost_price ?? record.costprice ?? "");
  if (costPrice !== undefined) patch.costPrice = costPrice;
  const promoPrice = parseOptionalMoney(record.promo_price ?? record.promoprice ?? "");
  if (promoPrice !== undefined) patch.promoPrice = promoPrice;

  const hidden = parseOptionalBool(record.hidden ?? "");
  if (hidden !== undefined) patch.hidden = hidden;

  if (
    patch.onHand == null &&
    patch.basePrice === undefined &&
    patch.salePrice === undefined &&
    patch.costPrice === undefined &&
    patch.promoPrice === undefined &&
    patch.hidden === undefined
  ) {
    return null;
  }
  return patch;
}

export function parseInventoryCsv(text: string): InventoryImportPatch[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const headers = table[0].map(normalizeHeader);
  const patches: InventoryImportPatch[] = [];
  for (const cells of table.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    const patch = rowFromRecord(record);
    if (patch) patches.push(patch);
  }
  return patches;
}

export async function parseInventoryXlsx(buffer: ArrayBuffer | Buffer): Promise<InventoryImportPatch[]> {
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(String(cell.text ?? cell.value ?? ""));
  });

  const patches: InventoryImportPatch[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      const value = cell.text ?? cell.value;
      record[header] = value == null ? "" : String(value);
    });
    const patch = rowFromRecord(record);
    if (patch) patches.push(patch);
  });
  return patches;
}

export function mapDbExportRow(row: {
  product_id: string;
  sku: string | null;
  upc: string | null;
  name: string;
  brand: string;
  on_hand: number | bigint | string;
  reserved: number | bigint | string;
  base_price: unknown;
  sale_price: unknown;
  cost_price: unknown;
  promo_price: unknown;
  hidden: boolean | number | bigint;
}): InventoryExportRow {
  const onHand = Math.max(0, Math.floor(asNum(row.on_hand)));
  const reserved = Math.max(0, Math.floor(asNum(row.reserved)));
  return {
    productId: row.product_id,
    sku: row.sku ?? "",
    upc: row.upc ?? "",
    name: row.name,
    brand: row.brand,
    onHand,
    reserved,
    available: Math.max(0, onHand - reserved),
    basePrice: row.base_price == null || row.base_price === "" ? null : moneyNumber(row.base_price),
    salePrice: row.sale_price == null || row.sale_price === "" ? null : moneyNumber(row.sale_price),
    costPrice: row.cost_price == null || row.cost_price === "" ? null : moneyNumber(row.cost_price),
    promoPrice: row.promo_price == null || row.promo_price === "" ? null : moneyNumber(row.promo_price),
    hidden: Boolean(asNum(row.hidden as number) || row.hidden === true),
  };
}
