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
  1826, // ER_FK_DUP_NAME (some builds)
]);

function isAlreadyExistsError(error: unknown): boolean {
  const err = error as {
    meta?: { code?: string | number };
    code?: string | number;
    message?: string;
  };
  const code = Number(err.meta?.code ?? err.code);
  if (Number.isFinite(code) && ALREADY_EXISTS.has(code)) return true;
  const msg = String(err.message ?? error ?? "");
  return (
    msg.includes("Duplicate column") ||
    msg.includes("Duplicate key") ||
    msg.includes("1060") ||
    msg.includes("1061") ||
    msg.includes("already exists") ||
    msg.includes("ER_DUP_FIELDNAME") ||
    msg.includes("Duplicate foreign key")
  );
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

export async function foreignKeyExists(table: string, constraint: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ hits: bigint | number }>>`
    SELECT COUNT(*) AS hits
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = ${table}
      AND CONSTRAINT_NAME = ${constraint}
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  `;
  return Number(rows[0]?.hits ?? 0) > 0;
}

/**
 * Adds a named foreign key when missing. `clause` is the REFERENCES … ON DELETE …
 * fragment only — pass literals from this codebase, never user input.
 */
export async function addForeignKeyIfMissing(
  table: string,
  constraint: string,
  column: string,
  clause: string,
): Promise<void> {
  if (await foreignKeyExists(table, constraint)) return;
  await runIdempotentDdl(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` FOREIGN KEY (\`${column}\`) ${clause}`,
  );
}

export async function createUniqueIndexIfMissing(
  table: string,
  index: string,
  columns: string,
): Promise<void> {
  if (await indexExists(table, index)) return;
  await runIdempotentDdl(`CREATE UNIQUE INDEX \`${index}\` ON \`${table}\` (${columns})`);
}

export async function columnTypeMatches(
  table: string,
  column: string,
  dataType: string,
  numericPrecision?: number,
  numericScale?: number,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<
    Array<{
      DATA_TYPE: string;
      NUMERIC_PRECISION: number | null;
      NUMERIC_SCALE: number | null;
    }>
  >`
    SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${table}
      AND COLUMN_NAME = ${column}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return false;
  if (String(row.DATA_TYPE).toLowerCase() !== dataType.toLowerCase()) return false;
  if (numericPrecision != null && Number(row.NUMERIC_PRECISION) !== numericPrecision) return false;
  if (numericScale != null && Number(row.NUMERIC_SCALE) !== numericScale) return false;
  return true;
}

/**
 * MODIFY COLUMN when the live type is not the expected DECIMAL definition.
 * `definition` is interpolated verbatim — literals only.
 */
export async function modifyColumnToDecimalIfNeeded(
  table: string,
  column: string,
  definition: string,
  precision: number,
  scale: number,
): Promise<void> {
  if (!(await columnExists(table, column))) return;
  if (await columnTypeMatches(table, column, "decimal", precision, scale)) return;
  await runIdempotentDdl(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
}
