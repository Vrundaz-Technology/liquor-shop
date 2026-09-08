# Sam's Discount Liquor — Premium AR Liquor Store

Next.js 15 storefront with a MySQL/MariaDB backend: cinematic landing, 3D virtual showroom (React Three Fiber), AR product viewing, branch-aware inventory, cart/checkout, loyalty dashboard, events, and luxury UI.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4
- MySQL 8 / MariaDB 10.4+ (phpMyAdmin) · Prisma 6 · Next.js Route Handlers
- Framer Motion · GSAP · Three.js · R3F · Drei
- Zustand · TanStack Query · Fuse.js · Zod · Lucide

## Setup

1. Copy `.env.example` to `.env` and set your MySQL credentials:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/liquorshop"
AUTH_SECRET="replace-with-a-long-random-string"
```

URL-encode special characters in the password (`@` → `%40`, `#` → `%23`). Do not
append `?schema=public` — that is Postgres-only syntax and MySQL will reject the URL.

2. Create the `liquorshop` database in phpMyAdmin if it does not exist. Use
   collation `utf8mb4_unicode_ci` to match what the migration expects.

   Prisma connects over TCP 3306 rather than through phpMyAdmin itself. To
   reach the database from outside the hosting account, add your IP under
   **hPanel → Databases → Remote MySQL** first.

3. Install, push the schema, and seed catalog data:

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database commands

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Change the schema locally — generates a migration in `prisma/migrations/` |
| `npm run db:deploy` | Apply pending migrations (what deploys run) |
| `npm run db:drift` | Report anything in `schema.prisma` the database is missing; exits non-zero on drift |
| `npm run db:baseline` | One-time: mark `0_init` applied on a database that already has the tables |
| `npm run db:seed` | Upsert bottles, locations, inventory, events, reviews, demo users |
| `npm run db:setup` | Deploy + seed |
| `npm run db:studio` | Browse tables in Prisma Studio |
| `npm run db:push` | Local prototyping only — see the warning below |

Re-seeding updates catalog copy only. Live stock, event seats, loyalty points, and order history are preserved.

## Schema changes

`npm run build` runs `prisma migrate deploy` before `next build`, so **schema changes ship with the deploy that needs them**. `DATABASE_URL` must be available at build time. Use `npm run build:only` to build without touching the database.

To change the schema:

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate` — this writes a migration under `prisma/migrations/`.
3. **Commit that migration directory with your code.** A schema change without its migration will not reach production.

> [!WARNING]
> Do not use `npm run db:push` against a database that has migrations. It edits the schema without recording a migration, which is precisely how production ended up missing `orders.driver_id` and `location_inventory.hidden` — the app expected columns the database did not have, and sign-in returned a 500 that could only be diagnosed from runtime logs. `db:push` is for throwaway local databases only.

### Baselining an existing database

A database created before migrations existed has the tables but no `_prisma_migrations` table, so `prisma migrate deploy` refuses to run and fails with `P3005: The database schema is not empty`. Because `build` now runs `migrate deploy`, **this would fail the build.**

Run once per pre-existing database, before the first deploy:

```bash
npm run db:drift      # must report no differences first — repair any drift before baselining
npm run db:baseline   # marks 0_init as already applied
```

`db:baseline` only records that `0_init` is applied; it does not execute it, so no existing data is touched. Verify with `npm run db:deploy`, which should report `No pending migrations to apply.`

## API

| Route | Role |
|-------|------|
| `GET /api/bootstrap` | Catalog, locations, events, reviews, live inventory |
| `GET /api/products` · `POST /api/products` | List / add a bottle |
| `GET /api/products/[slug]` | Product detail |
| `GET /api/locations` | Branches + seed inventory |
| `GET /api/categories` | Category metadata |
| `GET /api/events` · `POST /api/events` | List / book seats |
| `GET /api/reviews?productId=` | Product reviews |
| `GET /api/activity` | Audit trail (staff+) |
| `GET /api/inventory` · `PATCH /api/inventory` | Live stock (PATCH is staff+) |
| `POST /api/orders` · `PATCH /api/orders` | Checkout (atomic stock + order) / cancel |
| `POST /api/auth/login` · `POST /api/auth/signup` · `POST /api/auth/logout` | JWT login / signup / logout |
| `POST /api/auth/refresh` | Rotate access JWT from httpOnly refresh cookie |
| `GET /api/auth/me` · `PATCH /api/auth/me` | Current user from Bearer/access JWT / profile |
| `GET /api/users` · `POST /api/users` · `PATCH /api/users` | User management (admin / owner) |

Checkout recalculates prices and totals on the server, deducts stock in a transaction, and upserts a customer by email (guest or logged in).

## Highlights

| Route | Experience |
|-------|------------|
| / | Cinematic landing, floating 3D bottles, scroll storytelling |
| /virtual-store | Walk aisles, click bottles, product drawer |
| /ar/[slug] | View in Your Space (GLB + USDZ) |
| /shop, /shop/[category] | Filters, search, sort |
| /products/[slug] | 360 viewer, reviews, cocktails, similar |
| /cart, /checkout | Coupons, tax, pickup/delivery, guest/login |
| /login, /signup, /account | Password sign-in, customer signup, profile |
| /locations | Map + 3 branches with local stock |
| /events | Booking + seats |
| /dashboard | Analytics, inventory, activity, user management |

## Notes

- Coupons: `SAMS10`, `GOLD15`, `WELCOME20`.
- Roles: `customer` (shop), `staff` (inventory + activity), `admin` (users except owners), `owner` (full).
- Demo password for seeded accounts: `Liquor123!`
  - `owner@samsdiscountliquor.com` (owner)
  - `admin@samsdiscountliquor.com` (admin)
  - `staff@samsdiscountliquor.com` (staff)
  - `alex.reed@email.com` (customer)
- AR uses demo GLB/USDZ placeholders; swap `glbUrl` / `usdzUrl` on products for real bottle assets.
- Must be of legal drinking age messaging included in footer.
