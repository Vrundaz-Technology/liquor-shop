/**
 * Loads membership-tier test shoppers into the connected MySQL database.
 * Usage: npx tsx scripts/seed-loyalty-test-customers.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEMO_PASSWORD } from "../src/lib/auth/roles";
import { LOYALTY_TEST_FIXTURES } from "../src/data/loyalty-test-customers";
import { seedLoyaltyFixtures } from "../src/lib/db/seed-loyalty-fixtures";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await seedLoyaltyFixtures(prisma, passwordHash);
  console.log("Loyalty test shoppers are ready. Password for all:", DEMO_PASSWORD);
  for (const row of LOYALTY_TEST_FIXTURES) {
    console.log(
      `  ${row.email.padEnd(36)} ${String(row.loyaltyPoints).padStart(5)} pts  ${row.loyaltyTier.padEnd(13)}  ${row.case}`,
    );
  }
  console.log("  alex.reed@email.com".padEnd(38), "2480 pts  Collector     Existing demo (mid-Collector)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
