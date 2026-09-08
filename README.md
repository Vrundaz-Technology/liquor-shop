# Sam's Discount Liquor — Premium AR Liquor Store

Next.js 15 storefront with a MySQL backend: cinematic landing, 3D virtual showroom (React Three Fiber), AR product viewing, branch-aware inventory, cart/checkout, loyalty dashboard, events, and luxury UI.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4
- MySQL · Prisma 6 · Next.js Route Handlers
- Framer Motion · GSAP · Three.js · R3F · Drei
- Zustand · TanStack Query · Fuse.js · Zod · Lucide

## Setup

1. Copy `.env.example` to `.env` and set your MySQL credentials:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/liquor_shop"
AUTH_SECRET="replace-with-a-long-random-string"
```

2. Create the `liquor_shop` database in MySQL / phpMyAdmin if it does not exist.

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
| `npm run db:push` | Create / sync tables from `prisma/schema.prisma` |
| `npm run db:seed` | Upsert bottles, locations, inventory, events, reviews, demo users |
| `npm run db:setup` | Push + seed |
| `npm run db:studio` | Browse tables in Prisma Studio |

Re-seeding updates catalog copy only. Live stock, event seats, loyalty points, and order history are preserved.

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
