import { PrismaClient } from "@prisma/client";
import { ensureOrganizationSchema } from "../src/lib/db/organization";

const prisma = new PrismaClient();

async function main() {
  await ensureOrganizationSchema();
  const rows = await prisma.$queryRawUnsafe<
    { TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; NUMERIC_PRECISION: number; NUMERIC_SCALE: number }[]
  >(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME IN (
         'price','total','subtotal','tax_amount','discount_amount','delivery_fee',
         'cost_price','base_price','sale_price','promo_price','compare_at_price',
         'min_subtotal','value','total_spent','tax_rate','points_per_dollar','redeem_rate',
         'delivery_free_minimum','minimum_order_amount'
       )
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  console.log(
    rows.map((x) => ({
      table: x.TABLE_NAME,
      column: x.COLUMN_NAME,
      type: x.DATA_TYPE,
      precision: Number(x.NUMERIC_PRECISION),
      scale: Number(x.NUMERIC_SCALE),
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
