import { prisma } from "@/lib/db/prisma";

/** Add a column only if missing (MySQL/MariaDB — no ADD COLUMN IF NOT EXISTS on older MySQL). */
export async function ensureColumn(
  table: string,
  column: string,
  definition: string,
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: number | bigint }>>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    table,
    column,
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
  );
}
