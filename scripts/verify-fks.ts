import { PrismaClient } from "@prisma/client";
import { ensureOrganizationSchema } from "../src/lib/db/organization";

const prisma = new PrismaClient();

async function main() {
  await ensureOrganizationSchema();
  const rows = await prisma.$queryRawUnsafe<
    { TABLE_NAME: string; CONSTRAINT_NAME: string; REFERENCED_TABLE_NAME: string }[]
  >(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
  );
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
