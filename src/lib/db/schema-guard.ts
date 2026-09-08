import { prisma } from "./prisma";

/**
 * MySQL 8 has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and no
 * `CREATE INDEX IF NOT EXISTS` (MariaDB does, but we target the common subset
 * so the same build runs on either server). The existence check therefore
 * lives here, against information_schema, instead of in the DDL itself.
 */

/** MySQL error codes that mean "the thing I tried to add is already there". */
const ALREADY_EXISTS = new Set([
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1050, // ER_TABLE_EXISTS_ERROR
]);

function isAlreadyExistsError(error: unknown): boolean {
  const meta = (error as { meta?: { code?: string | number } })?.meta;
  const code = Number(meta?.code);
  return Number.isFinite(code) && ALREADY_EXISTS.has(code);
}

/**
 * Runs DDL, swallowing only "already exists" failures. Two concurrent requests
 * can both observe a column as missing and both issue the ALTER; the loser must
 * not take the request down with it.
 */
async function runIdempotentDdl(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    if (isAlreadyExistsError(error)) return;
    throw error;
  }
}

export async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ hits: bigint | number }>>`
    SELECT COUNT(*) AS hits
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${table}
      AND COLUMN_NAME = ${column}
  `;
  return Number(rows[0]?.hits ?? 0) > 0;
}

export async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ hits: bigint | number }>>`
    SELECT COUNT(*) AS hits
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${table}
      AND INDEX_NAME = ${index}
  `;
  return Number(rows[0]?.hits ?? 0) > 0;
}

/**
 * `definition` is interpolated verbatim into DDL — pass only literals from this
 * codebase, never user input. Same for `table` / `column` / `index`.
 */
export async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (await columnExists(table, column)) return;
  await runIdempotentDdl(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

export async function createIndexIfMissing(
  table: string,
  index: string,
  columns: string,
): Promise<void> {
  if (await indexExists(table, index)) return;
  await runIdempotentDdl(`CREATE INDEX \`${index}\` ON \`${table}\` (${columns})`);
}
