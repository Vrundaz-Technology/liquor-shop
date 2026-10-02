import type { DocTopic } from "@/lib/docs/system-docs";

/**
 * In-app system documentation (Dashboard → Documentation).
 *
 * Writing rules: plain language first, exact rules second. Every rule here was
 * checked against the code that implements it; update the matching topic (and
 * DOCS_LAST_REVIEWED in system-docs.ts) whenever that behaviour changes.
 */
export const TOPICS: DocTopic[] = [
  // ───────────────────────────── Getting started ─────────────────────────────
  {
    id: "quick-start",
    title: "Start here",
    group: "start",
    section: "overview",
    summary:
      "A five-minute tour of the system: what each part does, who uses it, and where to go for common jobs.",
    audience: "New owners and admins. Read this first, then open the topic for the job you need.",
    permissions: ["docs.view"],
    blocks: [
      {
        heading: "The system in one paragraph",
        body: "One website runs everything. Shoppers use the storefront to browse bottles at their chosen store and order for delivery or pickup. Staff use this dashboard to ring up counter sales, prepare and dispatch orders, keep stock right, and look after customers. Owners and admins also set up stores, prices, offers, loyalty and staff accounts. Every important change is recorded in the Activity log.",
      },
      {
        heading: "Where to go for…",
        table: {
          columns: ["I want to…", "Go to"],
          rows: [
            ["See today's sales and how each store is doing", "Overview"],
            ["Sell to someone at the counter", "Point of sale"],
            ["Prepare, update, cancel or refund an order", "Orders"],
            ["Fix a stock count, change a price, hide a bottle", "Inventory"],
            ["Move bottles from one store to another", "Transfers"],
            ["Send an order out with a driver or Shipday", "Deliveries"],
            ["Look up a customer, add a note, check consent", "Customers"],
            ["Create a coupon or automatic offer", "Promotions"],
            ["Change points, tiers or rewards", "Loyalty"],
            ["Open a new store or change hours, fees or tax", "Locations"],
            ["Add a staff member or change what they can do", "Users"],
            ["Find out who changed something", "Activity"],
          ],
        },
      },
      {
        heading: "Your first day as an owner",
        steps: [
          "Check each store in Locations: address, hours, delivery fee, free-delivery minimum and tax rate.",
          "In Deliveries → Settings, turn pickup and delivery on or off per store and pick a dispatch policy.",
          "In Users, create an account for each staff member with the narrowest role that fits and only the stores they work at.",
          "Review Loyalty (points per dollar, rewards, tiers) and create any launch offers in Promotions.",
          "Place a test order on the storefront and follow it through Orders and Deliveries.",
        ],
      },
      {
        heading: "How to read these docs",
        list: [
          "Getting started explains roles and the dashboard itself.",
          "Operations and Manage have one topic per dashboard section, in the same order as the sidebar.",
          "Platform & architecture explains pricing, notifications, security and how the system is built.",
          "Common tasks has step-by-step guides; FAQ & troubleshooting answers the usual questions.",
          "Words in code style (like orders.view) are exact names used by the system.",
        ],
      },
    ],
    related: ["common-tasks", "roles-permissions", "dashboard-basics", "glossary"],
  },
  {
    id: "system-overview",
    title: "How the system fits together",
    group: "start",
    summary:
      "The three parts of the system (storefront, customer account, dashboard) and the life of an order from cart to doorstep.",
    audience: "Owners, admins and developers who want the big picture.",
    blocks: [
      {
        heading: "The three parts",
        table: {
          columns: ["Part", "Who uses it", "What it does"],
          rows: [
            ["Storefront", "Shoppers aged 21+", "Browse the catalog for one store at a time, cart, checkout for delivery or pickup, order tracking, event booking, 3D virtual store and AR bottle viewer."],
            ["Customer account", "Signed-in shoppers", "Orders, saved addresses, home store, loyalty points and referrals, support tickets, profile."],
            ["Dashboard", "Staff, admins, owners, custom roles", "POS, orders, inventory, transfers, deliveries, customers, promotions, loyalty, stores, events, reviews, support, users, activity and scheduled jobs."],
          ],
        },
      },
      {
        heading: "The life of an online order",
        steps: [
          "The shopper picks a store. Prices, stock, fees and tax all come from that store.",
          "At checkout the server recalculates everything itself (offer → points → delivery fee → tax) and reserves the bottles, so stock cannot be oversold.",
          "The order appears in Orders as `new`. Staff with Orders access at that store get a notification.",
          "Staff move the order along: accepted → preparing → ready → (delivery) out for delivery → delivered, or (pickup) ready for pickup → picked up.",
          "When the order leaves `new`, the reserved bottles are recorded as sold in the stock history.",
          "Delivery orders go to an in-house driver or to Shipday, following the store's dispatch policy.",
          "The customer gets a notice at each step (if their preferences allow), earns loyalty points, and their customer record is updated.",
        ],
      },
      {
        heading: "A counter (POS) sale",
        body: "Simpler: the bottles are deducted straight away and the order is created as `completed`. Nothing needs preparing or dispatching.",
      },
    ],
    related: ["checkout-pricing", "orders", "deliveries", "architecture"],
  },
  {
    id: "roles-permissions",
    title: "Roles & permissions",
    group: "start",
    section: "users",
    summary:
      "Who can see and do what. Each person has a role, optional extra or removed permissions, and a list of stores they can work at.",
    audience: "Owners and admins who create staff accounts.",
    permissions: ["users.view", "users.assign_roles", "users.edit"],
    blocks: [
      {
        heading: "The idea in short",
        list: [
          "A role is a bundle of permissions (for example, Staff can sell and manage orders but cannot edit the catalog).",
          "You can add or remove single permissions for one person without changing their role.",
          "You can limit a person to certain stores. They then only see orders, stock and activity for those stores.",
          "The server checks permissions on every action. Hiding a button is only a convenience; it is not the security.",
        ],
      },
      {
        heading: "Built-in roles",
        table: {
          columns: ["Role", "Level", "What they can do"],
          rows: [
            ["Owner", "3 (highest)", "Everything, always, at every store. Only owners can create other owners and manage platform-wide offers."],
            ["Admin", "2", "Every permission, including Documentation, but cannot create, edit or remove owners."],
            ["Staff", "1", "Day-to-day work: POS, orders, stock counts and restock, transfers, deliveries, support tickets, and read-only customers, offers, loyalty and analytics."],
            ["Customer", "0", "Shopping only. No dashboard."],
          ],
        },
      },
      {
        heading: "Custom roles and ready-made presets",
        body: "In Users → Roles (Add role) you can create your own roles with any mix of permissions and a level of 0–2. One-click presets: Store Manager, Cashier, Warehouse, Driver Ops and Customer Service. A role that is still assigned to someone cannot be deleted.",
      },
      {
        heading: "How a person's final permissions are worked out",
        steps: [
          "Start with everything in their role.",
          "Take away any permissions you removed for them.",
          "Add any permissions you granted them.",
          "If any action in a group is on (for example Manage orders), the matching view permission (View orders) is switched on automatically.",
        ],
      },
      {
        heading: "Who can change whom",
        list: [
          "Changing roles needs Assign roles (users.assign_roles). Only an owner can make someone an owner.",
          "An admin can hand out a custom role only if the admin already has every permission in it.",
          "Otherwise you can only change people whose role is lower than yours. The same rule covers editing, deactivating and resetting passwords.",
        ],
      },
      {
        heading: "Permission groups",
        body: "Dashboard, POS, Orders, Inventory, Catalog, Locations, Events, Reviews, Support, Deliveries, CRM, Promotions, Loyalty, Analytics, Activity, Users and Documentation. In the permission editor each group shows its view permission first, then its actions.",
        note: { tone: "info", text: "Documentation (docs.view) is on for owners and admins by default. Turn it on for anyone else from their permission editor or their custom role." },
      },
    ],
    related: ["users", "common-tasks", "security"],
  },
  {
    id: "dashboard-basics",
    title: "Using the dashboard",
    group: "start",
    section: "overview",
    summary: "Finding your way around: the sidebar, the store picker, notifications, signing in, and keyboard use.",
    audience: "Everyone who uses the dashboard.",
    permissions: ["dashboard.access"],
    blocks: [
      {
        heading: "Finding your way",
        list: [
          "The sidebar is grouped into Operations, Manage, Help and Account. You only see sections you have permission for.",
          "Type in “Find a page…” to filter the sidebar by name or description.",
          "On desktop, collapse the sidebar with the panel button; this device remembers your choice.",
          "Every section, order, customer and documentation topic has its own web address, so you can bookmark or share it.",
          "On phones the menu opens from the left. Press Escape or tap outside to close it.",
        ],
      },
      {
        heading: "Choosing a store",
        body: "Overview, Orders, Inventory and POS have a store picker. “All stores” appears only if you can access every store. Picking a store here also switches the storefront to that store in this browser.",
      },
      {
        heading: "Notifications",
        body: "The bell at the top shows your staff inbox: new orders, stock transfers and support tickets. Sounds and read behavior are set per device in Notifications.",
      },
      {
        heading: "Signing in and staying signed in",
        list: [
          "You stay signed in for up to 7 days of inactivity. Behind the scenes a short 15-minute pass is renewed automatically.",
          "Deactivated accounts are blocked on their very next action, not just at the next sign-in.",
          "Use the account menu to sign out on shared computers.",
        ],
      },
      {
        heading: "Keyboard and screen readers",
        list: [
          "Tab moves between controls; a gold outline shows where you are.",
          "Dropdowns: Arrow keys move, Enter picks, Escape closes, and typing jumps to a matching option.",
          "Pop-up windows keep focus inside until closed and return you to where you were.",
        ],
      },
    ],
    related: ["quick-start", "profile-notifications", "accessibility"],
  },
  {
    id: "common-tasks",
    title: "Common tasks (how-to)",
    group: "start",
    summary: "Step-by-step guides for the jobs owners and admins do most often.",
    audience: "Owners, admins and store managers.",
    blocks: [
      {
        heading: "Add a staff member",
        steps: [
          "Users → Create user. Enter name, email and a starting password (8+ characters with at least one letter and one number).",
          "Pick the role. Choose a preset such as Cashier if a built-in role gives too much access.",
          "Under store access, tick only the stores they work at (leave empty for all stores).",
          "Save, and give them the password privately. They can change it in Profile.",
        ],
      },
      {
        heading: "Remove someone's access when they leave",
        steps: [
          "Users → find the person → switch Active off.",
          "They are blocked on their next action. Their past work stays in the Activity log.",
        ],
      },
      {
        heading: "Open a new store",
        steps: [
          "Locations → Add store. Fill in address, phone, hours, delivery radius, delivery fee, free-delivery minimum and tax rate.",
          "Deliveries → Settings: turn pickup and delivery on, choose the dispatch policy.",
          "Stock it: use Transfers from an existing store, or Inventory → Import with a spreadsheet.",
          "Give staff access to the new store in Users.",
        ],
      },
      {
        heading: "Run a weekend 15% off whiskey offer",
        steps: [
          "Promotions → New promotion. Type: percent, value 15%. Scope: organization (all stores) or location (one store).",
          "Rules: category whiskey; days Saturday and Sunday. Leave the code empty to apply it automatically, or set a code such as WEEKEND15.",
          "Set start and end dates and save. Track results in Promotions → Performance.",
        ],
      },
      {
        heading: "Refund part of an order",
        steps: [
          "Orders → open the order → Issue refund.",
          "Enter the amount and a reason. Leave Restock on if the bottles are back on the shelf.",
          "Confirm. The payment status becomes partially refunded or refunded, and the customer's spend and points are adjusted.",
        ],
      },
      {
        heading: "Fix a wrong stock count",
        steps: [
          "Inventory → choose the store → find the bottle.",
          "Change the on-hand number to what is actually on the shelf (type it, or use the + / − buttons).",
          "The change is saved in the stock history and the Activity log. Increases by someone with Restock are recorded as a restock; everything else as an adjustment.",
        ],
      },
      {
        heading: "Hide a bottle from one store's shop",
        steps: ["Inventory → choose the store → the bottle → Hide from website. It disappears from that store's storefront only; stock and history stay. Use Show on website to bring it back."],
      },
      {
        heading: "Update prices for many bottles at once",
        steps: [
          "Inventory → Export (CSV or Excel) for the store.",
          "Edit the price columns in the spreadsheet. Leave other columns as they are.",
          "Inventory → Import the file (up to 5 MB and 5,000 rows).",
        ],
        note: { tone: "info", text: "If the file contains on-hand counts, the import also needs the Restock permission." },
      },
      {
        heading: "Connect Shipday",
        steps: [
          "Deliveries → Settings → Shipday: paste the API key and webhook secret, then save. Both are stored encrypted.",
          "In your Shipday account, set the webhook address shown on that card.",
          "Turn Shipday on for each store that should use it and pick a dispatch policy.",
        ],
      },
    ],
    related: ["users", "locations", "promotions", "orders", "inventory", "deliveries"],
  },

  // ───────────────────────────── Operations ─────────────────────────────
  {
    id: "overview-analytics",
    title: "Overview & analytics",
    group: "operations",
    section: "overview",
    summary: "Your sales and profit picture for any date range, for one store or all of them.",
    audience: "Owners, admins and managers checking how the business is doing.",
    permissions: ["analytics.view", "dashboard.overview"],
    blocks: [
      {
        heading: "What the numbers mean",
        table: {
          columns: ["Figure", "Meaning"],
          rows: [
            ["Gross sales", "Order value before refunds."],
            ["Net sales", "What you kept after refunds."],
            ["Orders / average order", "Number of orders and average value per order."],
            ["Discounts", "Value of offers and points redeemed."],
            ["Refunds", "Money returned in the period."],
            ["Tax", "Tax collected (owed to the tax authority, not income)."],
            ["Delivery revenue vs. delivery costs", "Fees charged to customers versus what deliveries cost you, including Shipday."],
            ["Estimated COGS / profit", "Cost of the bottles sold (from cost prices) and the estimated profit after it."],
            ["New vs. returning customers", "First-time buyers versus repeat buyers in the period."],
          ],
        },
      },
      {
        heading: "Other panels",
        list: [
          "Orders by fulfilment (delivery, pickup, POS), including in-house versus Shipday deliveries, and cancelled orders.",
          "Store comparison when “All stores” is selected; tap a store to focus on it.",
          "Top products by quantity and revenue.",
          "Low-stock list so you can restock or transfer before you run out.",
        ],
        note: { tone: "info", text: "Profit is an estimate: it is only as accurate as the cost prices entered in Inventory." },
      },
    ],
    related: ["inventory", "orders", "promotions"],
  },
  {
    id: "pos",
    title: "Point of sale",
    group: "operations",
    section: "pos",
    summary: "Ring up counter sales against the store's live stock.",
    audience: "Cashiers and store staff.",
    permissions: ["pos.access", "pos.sell"],
    blocks: [
      {
        heading: "Making a sale",
        steps: [
          "Check the store in “Selling from” at the top.",
          "Search for bottles and add them to the ticket. The stock shown is what is available to sell.",
          "Optionally add the customer's name, email and phone, and a coupon.",
          "Choose cash, card or other, and complete. The bottles are deducted immediately and a completed order is created.",
        ],
      },
      {
        heading: "Good to know",
        list: [
          "No email means a walk-in sale: it does not earn loyalty points or create a customer record. Add an email to give points.",
          "If someone else sold the last bottle a moment ago, the sale is stopped with a stock message and nothing is charged.",
          "Limits: 80 lines per ticket, 99 of one bottle per line.",
          "Card here records the payment method; it does not run a card machine.",
        ],
      },
    ],
    related: ["orders", "inventory", "loyalty"],
  },
  {
    id: "orders",
    title: "Orders",
    group: "operations",
    section: "orders",
    summary: "Every online, pickup and counter order, with status updates, cancellations, refunds and the record of customer notices.",
    audience: "Store staff preparing orders; managers handling problems and refunds.",
    permissions: ["orders.view", "orders.manage"],
    blocks: [
      {
        heading: "Finding orders",
        body: "Filter by store, status, fulfilment, date or search text. “Unread” shows orders you have not opened since their new-order notice.",
      },
      {
        heading: "Order statuses",
        table: {
          columns: ["Type", "Normal path"],
          rows: [
            ["Delivery", "new → accepted → preparing → ready → assigned (driver) → picked_up → out_for_delivery → delivered"],
            ["Pickup", "new → preparing → ready_for_pickup → picked_up"],
            ["POS", "completed"],
          ],
        },
        list: [
          "Some steps can be skipped (for example new → preparing, or assigned → out_for_delivery).",
          "Any order that is not finished can be cancelled.",
          "Finished statuses cannot change: delivered, picked_up, completed, cancelled.",
        ],
      },
      {
        heading: "What happens when you change a status",
        list: [
          "Leaving `new` records the reserved bottles as sold.",
          "The delivery tracker follows along (out_for_delivery shows as “en route” to the customer).",
          "The customer gets the matching notice, if their preferences allow it.",
        ],
      },
      {
        heading: "Cancelling",
        list: [
          "The system lets customers cancel their own order while it is new, accepted or preparing.",
          "Staff with Manage orders can also cancel when it is ready, assigned, out for delivery or ready for pickup.",
          "Cancelling puts reserved bottles back, refunds what was paid, reverses loyalty points, cancels any Shipday job and frees the driver.",
        ],
      },
      {
        heading: "Refunds",
        list: [
          "Refund any amount up to what has not already been refunded.",
          "Restock is on by default unless the order was already delivered or picked up.",
          "Pressing Refund twice by accident cannot refund twice.",
        ],
      },
      {
        heading: "Customer notice log",
        body: "Inside an order you can see every email, text or push notice that was sent, skipped (and why), or failed, and re-send one if needed.",
      },
    ],
    related: ["deliveries", "customer-notifications", "checkout-pricing", "common-tasks"],
  },
  {
    id: "inventory",
    title: "Inventory & catalog",
    group: "operations",
    section: "inventory",
    summary: "Stock, prices and visibility for each store, plus the bottle catalog and shop categories.",
    audience: "Store staff counting stock; managers setting prices and the catalog.",
    permissions: ["inventory.view", "inventory.adjust", "inventory.restock", "inventory.reset", "catalog.create", "catalog.edit", "catalog.delete"],
    blocks: [
      {
        heading: "How stock works",
        list: [
          "Each store has its own count for each bottle.",
          "On hand = bottles physically in the store. Reserved = held for online orders not yet prepared. Available = on hand − reserved.",
          "A bottle is “low” when available stock reaches its low-stock level (5 unless changed).",
          "Every change is kept in the stock history with a reason: sale, reserve, release, restock, adjustment, reset, refund, transfer in, transfer out.",
        ],
      },
      {
        heading: "Actions and who can do them",
        table: {
          columns: ["Action", "Permission", "Notes"],
          rows: [
            ["Set or adjust a count", "inventory.adjust", "A count can never go below zero."],
            ["Restock", "inventory.restock", "Shoppers waiting for that bottle get a back-in-stock alert."],
            ["Change store prices", "inventory.adjust", "Base, sale, promo and cost price for this store."],
            ["Hide / show in this store", "inventory.adjust", "Only affects this store's storefront."],
            ["Reset a store", "inventory.reset", "Puts every count back to its starting value. Use with care."],
            ["Import spreadsheet", "inventory.adjust (+ inventory.restock for counts)", "CSV or Excel, up to 5 MB and 5,000 rows."],
            ["Export spreadsheet", "inventory.view", "Uses your current filters."],
          ],
        },
      },
      {
        heading: "Which price the shopper pays",
        body: "The first one that is set: sale price → promo price → store base price → catalog price. Cost price is never shown to shoppers and only to staff with access to that store.",
      },
      {
        heading: "Catalog and categories",
        list: [
          "Add bottles (catalog.create), edit details and photos (catalog.edit), remove bottles you added (catalog.delete).",
          "Inventory → Categories manages the shop's collections, using the same permissions.",
        ],
      },
    ],
    related: ["transfers", "common-tasks", "overview-analytics"],
  },
  {
    id: "transfers",
    title: "Transfers",
    group: "operations",
    section: "transfers",
    summary: "Move bottles between stores, with a full history.",
    audience: "Managers and warehouse staff balancing stock.",
    permissions: ["inventory.transfer", "inventory.view"],
    blocks: [
      {
        heading: "Making a transfer",
        steps: [
          "Choose the store sending the bottles and the store receiving them. You need access to both.",
          "Add bottles and quantities. You can only send what is available (not reserved) at the sending store.",
          "Submit. Stock moves immediately and the transfer is marked completed.",
        ],
      },
      {
        heading: "What gets recorded",
        list: [
          "A “transfer out” at the sender and a “transfer in” at the receiver in the stock history.",
          "If the receiving store has never stocked that bottle, it is added with the sender's prices.",
          "Staff with transfer access are notified, and the Activity log records who moved what.",
        ],
        note: { tone: "info", text: "Transfers complete instantly; there is no in-transit step. Submit once the bottles have actually left." },
      },
    ],
    related: ["inventory", "activity"],
  },
  {
    id: "deliveries",
    title: "Deliveries & drivers",
    group: "operations",
    section: "deliveries",
    summary: "Send delivery orders out with your own drivers or Shipday, follow them to the door, and set each store's delivery options.",
    audience: "Dispatchers, drivers and managers.",
    permissions: ["deliveries.view", "deliveries.manage"],
    blocks: [
      {
        heading: "Who delivers an order (dispatch policy)",
        table: {
          columns: ["Policy", "What happens when an order is placed"],
          rows: [
            ["Manual", "Nothing automatic. Staff assign each order in Deliveries."],
            ["In-house first (default)", "A free in-house driver if in-house delivery is on; otherwise Shipday, if it is on and connected."],
            ["Shipday always", "Shipday first; an in-house driver if Shipday is not available."],
          ],
        },
      },
      {
        heading: "Delivery steps",
        body: "unassigned → assigned → picked up → en route → delivered. An in-house driver can only pick up once the order is packed (marked ready in Orders).",
      },
      {
        heading: "Drivers",
        list: [
          "Deliveries → Drivers: add drivers, set their store, vehicle and status (available, on route, offline).",
          "Removing a driver deactivates them; their delivery history stays.",
          "A driver linked to a login who lacks Manage deliveries sees only their own runs and can only update those.",
        ],
      },
      {
        heading: "Shipday",
        list: [
          "Every Shipday job carries the alcohol rule: check ID, recipient must be 21+, signature required.",
          "Shipday sends status updates back automatically: picked up → out for delivery, delivered → delivered. Failed attempts are flagged for you to follow up.",
          "A Shipday job cannot be moved back to unassigned.",
        ],
      },
      {
        heading: "Store delivery settings",
        body: "Deliveries → Settings, per store: pickup on/off, delivery on/off, in-house delivery on/off, Shipday on/off, dispatch policy, and the Shipday account connection.",
      },
    ],
    related: ["orders", "common-tasks", "locations"],
  },

  // ───────────────────────────── Manage ─────────────────────────────
  {
    id: "customers",
    title: "Customers (CRM)",
    group: "manage",
    section: "customers",
    summary: "Everyone who has shopped with you: spend, orders, loyalty, favorites, segments, notes and marketing consent.",
    audience: "Owners, managers and customer service.",
    permissions: ["customers.view", "customers.edit"],
    blocks: [
      {
        heading: "Segments",
        body: "Each customer is placed in the first segment that fits, checked in this order:",
        table: {
          columns: ["Segment", "Rule"],
          rows: [
            ["VIP", "Spent $2,000 or more"],
            ["Frequent", "10 or more orders"],
            ["New", "Exactly 1 order"],
            ["Inactive", "No order in the last 60 days"],
            ["Regular", "Everyone else"],
          ],
        },
      },
      {
        heading: "What you can change",
        list: [
          "Private staff notes (customers never see them).",
          "Marketing consent and channel choices: marketing emails, order emails, texts, push.",
          "Extra email addresses and phone numbers for notices (up to 8 of each).",
        ],
        note: { tone: "warning", text: "Only send marketing to customers who have given consent. The system enforces this for its own offer notices." },
      },
      {
        heading: "Where the numbers come from",
        body: "Updated automatically with every order and corrected on cancellations and refunds. Average order value = total spent ÷ number of orders.",
      },
    ],
    related: ["loyalty", "customer-notifications", "customer-account"],
  },
  {
    id: "promotions",
    title: "Promotions",
    group: "manage",
    section: "promotions",
    summary: "Coupons and automatic offers for one store, all your stores, or the whole platform, with clear rules for which one wins.",
    audience: "Owners and marketing managers.",
    permissions: ["promotions.view", "promotions.manage"],
    blocks: [
      {
        heading: "Offer types",
        table: {
          columns: ["Type", "What the customer gets"],
          rows: [
            ["Percent", "A percentage off the qualifying items."],
            ["Fixed", "A dollar amount off."],
            ["Free delivery", "No delivery fee."],
            ["Buy X get Y", "For example buy 2 get 1 free; the cheapest qualifying bottles are the free ones."],
          ],
        },
      },
      {
        heading: "Coupon or automatic?",
        list: [
          "With a code: the customer types it at checkout.",
          "Without a code: it applies automatically to everyone who qualifies.",
        ],
      },
      {
        heading: "Rules you can add",
        list: [
          "Only certain categories, brands or bottles.",
          "A minimum spend (on the qualifying items).",
          "First order only, or a maximum number of uses per customer.",
          "Start and end dates, days of the week, and a daily time window (overnight windows work).",
        ],
      },
      {
        heading: "When more than one offer applies",
        steps: [
          "The most specific offer is preferred: a store offer beats an all-stores offer, which beats a platform offer.",
          "Between offers at the same level, the higher priority number wins.",
          "The winning offer applies. Other offers marked “stackable” are added on top, never taking the total below zero.",
          "A stackable free-delivery offer can combine with a discount.",
        ],
      },
      {
        heading: "Good to know",
        list: [
          "Only owners can create or change platform-wide offers.",
          "Saving a new active offer sends an offer notice to up to 80 customers who agreed to marketing.",
          "Promotions → Performance shows customers, orders, sales and total discount per offer, and each use.",
        ],
      },
    ],
    related: ["checkout-pricing", "common-tasks", "customers"],
  },
  {
    id: "loyalty",
    title: "Loyalty",
    group: "manage",
    section: "loyalty",
    summary: "Your rewards program: how customers earn and spend points, tiers, rewards, and bonuses.",
    audience: "Owners and marketing managers.",
    permissions: ["loyalty.view", "loyalty.manage"],
    blocks: [
      {
        heading: "Default settings",
        table: {
          columns: ["Setting", "Default"],
          rows: [
            ["Points per dollar", "1 point for every $1 spent (after discounts)"],
            ["Point value", "$0.02 each when spent"],
            ["Reward", "500 points = $10 off"],
            ["Birthday bonus", "100 points, claimed by the customer on their birthday, once a year"],
            ["Referral", "100 points to the person who referred, 50 to the new customer"],
            ["Tiers", "Member (0) · Connoisseur (500) · Collector (1,500) · VIP (3,000 points)"],
          ],
        },
      },
      {
        heading: "Earning and spending",
        list: [
          "Points are added after each order. Walk-in counter sales without an email do not earn.",
          "At checkout, if the points match a reward exactly, the reward's value is used; otherwise points × point value. Points can't take the order below zero.",
          "If an order is cancelled, the points it earned are removed and the points it used are given back.",
          "Managers can give bonus points to a customer.",
        ],
      },
    ],
    related: ["customers", "customer-account", "checkout-pricing"],
  },
  {
    id: "locations",
    title: "Locations",
    group: "manage",
    section: "locations",
    summary: "Your stores: address, hours, holiday hours, delivery area, fees, tax and the store page shoppers see.",
    audience: "Owners and admins.",
    permissions: ["locations.view", "locations.create", "locations.edit", "locations.delete"],
    blocks: [
      {
        heading: "What you set per store",
        list: [
          "Name, address, phone, email, description, up to 8 photos, and map position.",
          "Weekly opening hours and holiday hours (special hours or closed on a date).",
          "Delivery radius, delivery fee, the order value above which delivery is free, and tax rate (0–25%).",
          "Active: switching a store off hides it from shoppers but keeps all its history.",
        ],
        note: { tone: "warning", text: "The “minimum order” field is saved but checkout does not enforce it yet." },
      },
      {
        heading: "Removing a store",
        body: "Not allowed if it is your only store or if it has ever had an order. Switch it to inactive instead so reports stay correct.",
      },
      {
        heading: "Related settings elsewhere",
        body: "Pickup/delivery on or off and who delivers are in Deliveries → Settings. Which staff can work at the store is in Users.",
      },
    ],
    related: ["deliveries", "common-tasks", "checkout-pricing"],
  },
  {
    id: "events",
    title: "Events",
    group: "manage",
    section: "events",
    summary: "Tastings, launches and festivals that shoppers can book seats for.",
    audience: "Store managers and marketing.",
    permissions: ["events.view", "events.create", "events.edit", "events.delete"],
    blocks: [
      {
        heading: "Creating an event",
        list: [
          "Type: wine tasting, whiskey tasting, launch or festival.",
          "Store, date and time (the end must be after the start), price and number of seats (1–2,000).",
          "Inactive events, and events at inactive stores, are hidden from shoppers.",
        ],
      },
      {
        heading: "Bookings",
        body: "Shoppers book up to 12 seats at a time; no account is needed. Two people can never book the same last seat: if seats run out, the second booking is refused with a clear message.",
      },
    ],
    related: ["locations", "storefront"],
  },
  {
    id: "reviews",
    title: "Reviews",
    group: "manage",
    section: "reviews",
    summary: "Product, store and delivery reviews in one place, with moderation and public replies.",
    audience: "Owners, managers and customer service.",
    permissions: ["reviews.view", "reviews.moderate", "reviews.respond"],
    blocks: [
      {
        heading: "Review statuses",
        table: {
          columns: ["Status", "Meaning"],
          rows: [
            ["Published", "Visible on the storefront."],
            ["Flagged", "A shopper reported it; it needs a decision from you."],
            ["Hidden", "Removed from public view by a moderator."],
          ],
        },
      },
      {
        heading: "“Verified” badge",
        list: [
          "Product review: the reviewer received an order containing that bottle.",
          "Store review: the reviewer has a completed or ready order at that store.",
          "Delivery review: only for the reviewer's own delivered order, one per order.",
        ],
      },
      {
        heading: "Your actions",
        body: "Moderate reviews (publish or hide) with reviews.moderate. Post a public owner reply with reviews.respond. Both are recorded in the Activity log.",
      },
    ],
    related: ["support", "activity"],
  },
  {
    id: "support",
    title: "Support",
    group: "manage",
    section: "support",
    summary: "Customer help tickets, sent automatically to the right team, with replies and attachments.",
    audience: "Customer service and store managers.",
    permissions: ["support.view", "support.manage"],
    blocks: [
      {
        heading: "Who gets a ticket",
        table: {
          columns: ["Topic the customer picks", "Goes to"],
          rows: [
            ["Order problem, missing item, damaged bottle, delivery, refund, product question", "The store involved (from the order, chosen store, or the customer's home store); the owner if no store is known."],
            ["Account", "Owner"],
            ["Payment", "Platform team"],
          ],
        },
      },
      {
        heading: "Ticket statuses",
        body: "Open → Waiting on customer → Resolved → Closed. With support.manage you can reply, change priority (low, normal, high), change status and assign the ticket to a colleague.",
      },
      {
        heading: "Notifications",
        body: "Staff with Support access at that store are notified about new tickets and customer replies.",
      },
    ],
    related: ["orders", "customers", "profile-notifications"],
  },
  {
    id: "users",
    title: "Users",
    group: "manage",
    section: "users",
    summary: "Create accounts, set roles and store access, fine-tune permissions, and manage custom roles.",
    audience: "Owners and admins.",
    permissions: ["users.view", "users.create", "users.edit", "users.assign_roles", "users.deactivate", "users.reset_password"],
    blocks: [
      {
        heading: "What you can do",
        list: [
          "Create users (passwords need 8+ characters with at least one letter and one number).",
          "Edit details, deactivate or reactivate, and reset passwords.",
          "Add or remove single permissions for one person, and limit them to certain stores.",
          "Create custom roles from scratch or from a preset (Users → Roles → Add role).",
        ],
      },
      {
        heading: "Which permission each change needs",
        table: {
          columns: ["Change", "Permission needed"],
          rows: [
            ["Only the password", "Reset password, or Edit profiles"],
            ["Only the role", "Assign roles, or Edit profiles"],
            ["Only active on/off", "Deactivate users, or Edit profiles"],
            ["Anything else (name, email, photo, permissions, stores)", "Edit profiles"],
          ],
        },
      },
    ],
    related: ["roles-permissions", "common-tasks", "activity"],
  },
  {
    id: "activity",
    title: "Activity log",
    group: "manage",
    section: "activity",
    summary: "The permanent record of who changed what, when, and at which store.",
    audience: "Owners and admins investigating a change; anyone checking their own work.",
    permissions: ["activity.view"],
    blocks: [
      {
        heading: "What each entry shows",
        body: "Who did it (name, email and role at the time), what they did, what it affected, which store, when, and a before/after list of the fields that changed.",
      },
      {
        heading: "What is recorded",
        list: [
          "Orders and POS sales: placed, status changes, cancellations, refunds, notice re-sends.",
          "Stock: adjustments, restocks, resets, price and visibility changes, transfers, imports and exports.",
          "Catalog, categories, stores, events, offers, loyalty, customer notes, reviews, support, drivers and deliveries.",
          "Accounts: sign-ins, sign-ups, new users, role and permission changes, password resets, activation, custom roles.",
        ],
      },
      {
        heading: "Searching",
        body: "Filter by action, person, type of record, store, text and dates. People limited to some stores only see those stores.",
      },
    ],
    related: ["roles-permissions", "security"],
  },
  {
    id: "cron",
    title: "Scheduled jobs",
    group: "manage",
    section: "cron",
    summary: "Background tasks that run on a timer, what each one is for, and their run history.",
    audience: "Owners, admins and developers.",
    permissions: ["activity.view"],
    blocks: [
      {
        heading: "Jobs",
        table: {
          columns: ["Job", "Runs", "Status"],
          rows: [
            ["Abandoned carts", "Every 20 minutes", "Active: reminds shoppers whose cart has been idle 60+ minutes (up to 40 per run)."],
            ["Stale reservations", "Every 20 minutes", "Planned"],
            ["Low-stock digest", "Daily 8:00", "Planned"],
            ["Loyalty birthdays", "Daily 9:00", "Planned"],
            ["Offer start/end", "Hourly", "Planned"],
            ["Customer segments", "Daily 2:00", "Planned"],
            ["Log retention", "Daily 2:30", "Planned"],
            ["Cleanup", "Sundays 3:00", "Planned"],
            ["Stuck deliveries", "Every 30 minutes", "Planned"],
            ["Event reminders", "Daily 10:00", "Planned"],
          ],
        },
        body: "“Planned” jobs are listed so you can see what is coming; running them does nothing yet.",
      },
      {
        heading: "Running jobs",
        list: [
          "Press Run now on this screen; it is recorded as a manual run.",
          "For automatic runs, your hosting scheduler calls /api/cron/notifications?job=<job id> with the header Authorization: Bearer <CRON_SECRET>.",
        ],
        note: { tone: "warning", text: "In production, automatic runs are refused until CRON_SECRET is set on the server." },
      },
    ],
    related: ["customer-notifications", "operations-runbook"],
  },
  {
    id: "profile-notifications",
    title: "Profile & notifications",
    group: "manage",
    section: "notifications",
    summary: "Your own account details and your staff inbox.",
    audience: "Everyone who uses the dashboard.",
    permissions: ["dashboard.access"],
    blocks: [
      {
        heading: "Profile",
        body: "Change your photo, name, email and password. Changing the password asks for your current one.",
      },
      {
        heading: "Staff inbox",
        table: {
          columns: ["Notice", "Who receives it"],
          rows: [
            ["New order", "Staff who can view orders at that store"],
            ["Stock transfer", "Staff who can transfer stock"],
            ["New support ticket", "Staff who can view support at that store"],
            ["Customer replied to a ticket", "Staff who can view support at that store"],
          ],
        },
        list: ["You are never notified about your own actions.", "Mark one, several or all as read, and clear the ones you are done with."],
      },
      {
        heading: "This device",
        body: "Choose a sound (chime, bell, ping, pop, or upload your own) and how notices are marked read. These settings apply only to the device you set them on.",
      },
    ],
    related: ["dashboard-basics", "orders", "support"],
  },

  // ───────────────────────────── Platform ─────────────────────────────
  {
    id: "checkout-pricing",
    title: "Checkout & pricing",
    group: "platform",
    summary: "How an order's total is calculated and the checks made before it is accepted.",
    audience: "Owners checking a total; developers changing pricing.",
    blocks: [
      {
        heading: "How the total is worked out",
        steps: [
          "Subtotal: each bottle at this store's price.",
          "Minus the best offer (see Promotions).",
          "Minus loyalty points used.",
          "Plus delivery fee: $0 for pickup; $0 if the order reaches the store's free-delivery amount (default $150); otherwise the store's fee (default $12.50). A free-delivery offer also makes it $0.",
          "Plus tax: (subtotal − discounts) × the store's tax rate (default 8.875%).",
        ],
        body: "Total = subtotal − discounts + delivery fee + tax. The server always recalculates this itself; prices sent by the browser are ignored.",
      },
      {
        heading: "Checks before an order is accepted",
        list: [
          "The customer confirms they are 21 or older.",
          "The store is open for business online and offers the chosen pickup or delivery.",
          "No hidden bottles, and enough available stock (reserved in the same step so two shoppers can't buy the last bottle).",
          "The signed-in account decides who the customer is.",
          "At most 100 different bottles per order, and 8 orders per minute from one connection.",
        ],
      },
      {
        heading: "Order numbers and tracking codes",
        list: [
          "Order number: starts with ORD-.",
          "Delivery tracking code: SDL- followed by 10 random letters and numbers. Anyone with the code can see the order's progress, so it is long enough that it cannot be guessed.",
        ],
        note: { tone: "warning", text: "No card payment provider is connected yet: online orders are recorded as paid. Connect a payment provider before taking real card payments online." },
      },
    ],
    related: ["promotions", "loyalty", "locations", "orders"],
  },
  {
    id: "storefront",
    title: "Storefront",
    group: "platform",
    summary: "What shoppers see and can do, and the rules behind it.",
    audience: "Owners, marketing and developers.",
    blocks: [
      {
        heading: "Pages",
        table: {
          columns: ["Address", "Purpose"],
          rows: [
            ["/", "Home page"],
            ["/shop, /shop/<category>, /products/<bottle>", "Catalog with the selected store's stock and prices"],
            ["/cart, /checkout", "Cart with available offers; delivery or pickup checkout"],
            ["/track", "Track an order by tracking code (no sign-in) or order number (signed in, own orders)"],
            ["/account, /wishlist", "Customer account and saved bottles"],
            ["/support", "Open and follow support tickets"],
            ["/events, /locations", "Event booking and store finder (search by ZIP code)"],
            ["/virtual-store, /ar/<bottle>", "3D showroom and view a bottle in your room (AR)"],
          ],
        },
      },
      {
        heading: "Age check",
        body: "Visitors confirm they are 21+ before browsing; the answer is remembered for 30 days. Checkout asks again, and the delivery driver checks ID and takes a signature.",
      },
      {
        heading: "Tracking privacy",
        body: "With only a tracking code, a visitor sees the status, timeline, estimated arrival, store and delivery address. Payment details, courier phone numbers and internal costs are shown only to the signed-in buyer and to staff.",
      },
      {
        heading: "Shopper alerts",
        body: "Shoppers can ask to be told when a bottle is back in stock or drops below a price, and get a reminder about a forgotten cart. All follow their notification choices.",
      },
    ],
    related: ["customer-account", "checkout-pricing", "events"],
  },
  {
    id: "customer-account",
    title: "Customer account",
    group: "platform",
    summary: "What signed-in shoppers can see and manage themselves.",
    audience: "Customer service staff answering “where do I find…?” questions.",
    blocks: [
      {
        heading: "Account tabs",
        table: {
          columns: ["Tab", "What the customer can do"],
          rows: [
            ["Overview", "Points, tier, recent orders, spending trend and home store."],
            ["Orders", "Track status and reorder past orders in one tap."],
            ["Addresses", "Save delivery addresses for faster checkout."],
            ["Store & prefs", "Choose a home store and shopping preferences."],
            ["Loyalty", "Points history, claim the birthday bonus, share a referral code."],
            ["Support", "Open tickets and reply to staff."],
            ["Profile", "Photo, name, email and password."],
          ],
        },
      },
      {
        heading: "Sign-up",
        body: "Shoppers can create an account at /signup, optionally with a friend's referral code (both get bonus points).",
      },
    ],
    related: ["loyalty", "support", "customer-notifications"],
  },
  {
    id: "customer-notifications",
    title: "Customer notifications",
    group: "platform",
    summary: "The emails, texts and push messages customers receive, and when.",
    audience: "Owners, customer service and developers.",
    blocks: [
      {
        heading: "Order updates",
        table: {
          columns: ["When the order becomes…", "The customer is told"],
          rows: [
            ["new / accepted", "Order confirmed"],
            ["preparing", "Being prepared"],
            ["ready / ready_for_pickup", "Ready (or ready for pickup)"],
            ["assigned", "Driver assigned"],
            ["picked_up (delivery)", "Picked up by the driver"],
            ["out_for_delivery", "Out for delivery, and arriving soon"],
            ["delivered", "Delivered"],
            ["cancelled", "Cancelled"],
          ],
        },
      },
      {
        heading: "Other messages",
        body: "Offers (only with marketing consent), loyalty rewards, back-in-stock and price alerts, and forgotten-cart reminders.",
      },
      {
        heading: "Customer choices are respected",
        list: [
          "Order emails are on unless the customer turns them off.",
          "Marketing needs explicit consent.",
          "Texts: order confirmation by default; other texts only if the customer turned texts on. Push only if turned on.",
          "Up to 8 extra emails and phone numbers can receive notices.",
          "Every attempt is recorded on the order, including ones skipped and why.",
        ],
      },
      {
        heading: "Sending service",
        body: "Messages currently go to a placeholder service that records them in the server log instead of sending them.",
        note: { tone: "warning", text: "Until an email/SMS provider is connected, customers do not actually receive emails or texts. A developer connects one with setNotifier() in src/lib/notifications." },
      },
    ],
    related: ["orders", "customers", "cron"],
  },
  {
    id: "architecture",
    title: "Architecture",
    group: "platform",
    summary: "Technology, how a request is handled, and the rules that keep the code maintainable.",
    audience: "Developers and technical owners.",
    blocks: [
      {
        heading: "Technology",
        list: [
          "Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4.",
          "MySQL 8 / MariaDB through Prisma 6, with hand-written SQL on busy paths.",
          "Zustand for browser state (cart, store, wishlist saved locally) and TanStack Query for server data.",
          "Zod checks every incoming change; jose for sign-in tokens; bcrypt for passwords.",
        ],
      },
      {
        heading: "How a request is handled",
        steps: [
          "Signed-out visitors are sent to sign-in before /dashboard or /account loads.",
          "The browser calls /api/… with its sign-in token, renewing it once automatically if it has expired.",
          "The API checks who you are, what you may do, and which stores you can access, then validates the input.",
          "Changes to money or stock run inside a database transaction and are written to the Activity log.",
        ],
      },
      {
        heading: "Code layout",
        table: {
          columns: ["Folder", "Holds"],
          rows: [
            ["src/app", "Pages and API routes (src/app/api)."],
            ["src/components/dashboard", "One panel per dashboard section."],
            ["src/lib/db", "Database access. Server-only."],
            ["src/lib/commerce", "Business rules (pricing, offers, order status, dispatch), with unit tests."],
            ["src/lib/auth", "Sign-in, roles, permissions, store access."],
            ["src/lib/notifications", "Customer messages and preferences."],
            ["src/lib/docs", "This documentation."],
            ["prisma", "Database schema, migrations and seed data."],
          ],
        },
      },
      {
        heading: "Rules for developers",
        list: [
          "Never import src/lib/db from a browser (\"use client\") component. Put shared types and constants in a client-safe file (for example src/lib/crm-shared.ts).",
          "Check permissions in the API route, not only in the screen.",
          "Every money or stock change goes in a transaction and the Activity log.",
          "Schema changes always come with a committed migration.",
        ],
      },
    ],
    related: ["data-model", "security", "operations-runbook"],
  },
  {
    id: "data-model",
    title: "Data model",
    group: "platform",
    summary: "The main database tables and what each one holds.",
    audience: "Developers and anyone building reports.",
    blocks: [
      {
        heading: "Tables",
        table: {
          columns: ["Table", "Holds"],
          rows: [
            ["Organization", "Your business, plus settings such as encrypted Shipday keys."],
            ["User", "Accounts: role, permission changes, store access, profile, preferences."],
            ["RoleDefinition", "Custom roles."],
            ["Location", "Stores: hours, fees, tax, delivery area, delivery options."],
            ["Category, Product", "The catalog."],
            ["LocationInventory", "Each store's stock, reservations, prices and visibility per bottle."],
            ["InventoryLedger", "Every stock change and its reason."],
            ["InventoryTransfer (+ lines)", "Transfers between stores."],
            ["Order, OrderItem", "Orders with their money breakdown and delivery details."],
            ["OrderPayment", "Payments and refunds."],
            ["OrderNotification", "Notices sent (or skipped) for each order."],
            ["OrganizationCustomer", "Customer records: spend, orders, consent, notes, points."],
            ["Promotion", "Offers."],
            ["LoyaltyProgram, LoyaltyLedger", "Loyalty settings and points history."],
            ["Driver", "In-house drivers."],
            ["Event", "Events and seats."],
            ["PlatformReview, ReviewReport", "Reviews and reports of abuse."],
            ["SupportTicket, SupportMessage", "Support tickets and replies."],
            ["StaffNotification (+ recipients)", "Staff inbox and who has read what."],
            ["ActivityLog", "The audit trail."],
          ],
        },
      },
      {
        heading: "Money and percentages",
        body: "Amounts are stored with 2 decimal places. Percentages are stored as fractions (15% = 0.15). Tax rate is capped at 25%.",
      },
    ],
    related: ["architecture", "operations-runbook"],
  },
  {
    id: "security",
    title: "Security",
    group: "platform",
    summary: "How accounts, customer data and money are protected, and what you should do to keep it that way.",
    audience: "Owners, admins and developers.",
    blocks: [
      {
        heading: "Protections in place",
        list: [
          "Every action is permission-checked on the server, including store-level access.",
          "Sign-in cookies cannot be read by page scripts, and the short-lived sign-in pass is renewed automatically.",
          "In production, sign-in is switched off (with a clear error) if AUTH_SECRET is missing, the sample value, or shorter than 32 characters.",
          "Limits slow down guessing and abuse: sign-in (20 a minute per connection and 10 per 15 minutes per account), sign-up, orders, POS, event bookings, uploads, order tracking and coupon checks.",
          "Uploads are checked by their actual content and size. Shipday and the job scheduler must present a secret.",
          "Browsers are told to use HTTPS only and not to embed the site in other sites.",
          "Every sensitive change is in the Activity log.",
        ],
      },
      {
        heading: "Your checklist",
        list: [
          "Set long random values for AUTH_SECRET and CRON_SECRET on the server.",
          "Give each person the smallest role and fewest stores that let them do their job.",
          "Deactivate accounts the day someone leaves.",
          "Look through role and permission changes in the Activity log every month.",
        ],
      },
    ],
    related: ["roles-permissions", "activity", "operations-runbook"],
  },
  {
    id: "accessibility",
    title: "Accessibility",
    group: "platform",
    summary: "The site and dashboard are built and tested to WCAG 2.2 level AA so everyone can use them.",
    audience: "Everyone; developers changing the interface.",
    blocks: [
      {
        heading: "What this means in practice",
        list: [
          "Everything works with a keyboard, with a visible focus outline.",
          "Screen readers get proper labels, headings, landmarks and a “Skip to content” link.",
          "Text has enough contrast against the dark background.",
          "Animations are reduced when the device is set to reduce motion.",
          "Buttons and links are large enough to tap on phones.",
        ],
      },
      {
        heading: "How it is tested",
        body: "npm run test:a11y opens the main storefront and dashboard pages (including this one) in a browser and checks them against the WCAG 2.2 A and AA rules.",
      },
    ],
    related: ["dashboard-basics", "operations-runbook"],
  },
  {
    id: "operations-runbook",
    title: "Deployment & runbook",
    group: "platform",
    summary: "Server settings, database changes, building, deploying and testing.",
    audience: "Developers and whoever hosts the site.",
    blocks: [
      {
        heading: "Server settings (environment variables)",
        table: {
          columns: ["Name", "Needed?", "What it is"],
          rows: [
            ["DATABASE_URL", "Yes", "Database address, e.g. mysql://user:password@host:3306/liquorshop (special characters URL-encoded)."],
            ["AUTH_SECRET", "Yes", "Long random secret for sign-in and for encrypting stored keys. 32+ characters."],
            ["CRON_SECRET", "In production", "Secret your scheduler sends to run jobs."],
            ["NEXT_PUBLIC_SITE_URL", "Recommended", "The public web address; used for the Shipday webhook."],
            ["SHIPDAY_API_KEY, SHIPDAY_WEBHOOK_SECRET", "Optional", "Used only if not saved in Deliveries → Settings."],
            ["TRUSTED_PROXY_HOPS", "Optional", "How many proxies sit in front of the app (default 1); used to find the visitor's real address for rate limits."],
          ],
        },
        note: { tone: "warning", text: "Changing AUTH_SECRET signs everyone out and makes saved Shipday keys unreadable; re-enter them afterwards." },
      },
      {
        heading: "Commands",
        table: {
          columns: ["Command", "What it does"],
          rows: [
            ["npm run dev", "Run locally for development."],
            ["npm run build", "Apply pending database migrations, then build for production."],
            ["npm run build:only", "Build without touching the database."],
            ["npm start", "Run the production build."],
            ["npm run db:migrate", "Create a migration after editing prisma/schema.prisma."],
            ["npm run db:deploy", "Apply pending migrations."],
            ["npm run db:drift", "Check the database matches the schema."],
            ["npm run db:seed", "Load catalog, stores and demo users (keeps live stock and orders)."],
            ["npm test", "Unit tests."],
            ["npm run test:e2e / npm run test:a11y", "Browser tests and accessibility tests."],
          ],
        },
      },
      {
        heading: "Changing the database",
        steps: [
          "Edit prisma/schema.prisma.",
          "Run npm run db:migrate and commit the new folder in prisma/migrations with your code.",
          "Deploy. The build applies the migration before compiling.",
        ],
        note: { tone: "warning", text: "Never run db:push on a database that uses migrations. It changes tables without a record, and production drifts out of step." },
      },
    ],
    related: ["architecture", "security", "faq"],
  },
  {
    id: "glossary",
    title: "Glossary",
    group: "platform",
    summary: "Plain meanings of the words used across the system.",
    audience: "Everyone.",
    blocks: [
      {
        heading: "Terms",
        table: {
          columns: ["Term", "Meaning"],
          rows: [
            ["Available", "Bottles you can sell: on hand minus reserved."],
            ["Dispatch policy", "A store's rule for who delivers its orders: in-house drivers, Shipday, or manual."],
            ["Fulfilment", "How the customer gets the order: delivery, pickup or at the counter (POS)."],
            ["Ledger", "A history where every change is a new line and nothing is overwritten (stock and points both have one)."],
            ["On hand", "Bottles physically in the store."],
            ["Organization", "Your business. All stores, staff and customers belong to it."],
            ["Permission", "One thing a person is allowed to do, e.g. orders.manage."],
            ["Platform offer", "An offer that applies across the whole platform; only owners manage these."],
            ["Priority", "Tie-breaker number for offers at the same level; higher wins."],
            ["Reserved", "Bottles held for online orders that are not yet prepared."],
            ["Role", "A named set of permissions given to a person."],
            ["Scope", "Where an offer applies: one store (location), all your stores (organization), or platform."],
            ["Segment", "Customer group based on spend and orders: VIP, Frequent, New, Inactive, Regular."],
            ["Stackable", "An offer that can be added on top of the winning offer."],
            ["Store access", "The stores a person can see and work with."],
            ["Tier", "Loyalty level reached by points, e.g. Connoisseur."],
            ["Walk-in", "A counter sale with no customer email; it earns no points."],
          ],
        },
      },
    ],
    related: ["quick-start", "faq"],
  },
  {
    id: "faq",
    title: "FAQ & troubleshooting",
    group: "platform",
    summary: "Answers to the questions that come up most often.",
    audience: "Everyone.",
    blocks: [
      {
        heading: "A staff member can't see a section",
        body: "The section needs a permission they don't have, or they are limited to other stores. Check Users → their permissions and store access.",
      },
      {
        heading: "A bottle shows in stock but can't be sold",
        body: "Some of the stock is reserved for online orders. Available = on hand − reserved. Prepare or cancel those orders to free it.",
      },
      {
        heading: "A coupon isn't working",
        list: [
          "Check it is active and within its dates, days and time window.",
          "Check the minimum spend is met by the qualifying items, not the whole cart.",
          "Check first-order-only and uses-per-customer limits.",
          "A store offer outranks an all-stores offer; the customer may already be getting a better deal.",
        ],
      },
      {
        heading: "Customers say they didn't get an email or text",
        body: "Open the order's notice log to see whether it was sent, skipped (and why) or failed. Note that a real email/SMS service is not connected yet; see Customer notifications.",
      },
      {
        heading: "A delivery isn't being assigned automatically",
        body: "Check Deliveries → Settings for that store: delivery on, the dispatch policy is not Manual, an in-house driver is Available, or Shipday is on and connected.",
      },
      {
        heading: "Sign-in fails with “server authentication is misconfigured”",
        body: "The server's AUTH_SECRET is missing, the sample value, or too short. Set a long random value and restart.",
      },
      {
        heading: "Scheduled jobs don't run",
        body: "Set CRON_SECRET on the server and make sure your scheduler sends it as Authorization: Bearer <secret>. You can always use Run now in Scheduled jobs.",
      },
      {
        heading: "I can't delete a store",
        body: "Stores with orders, or your only store, can't be deleted. Mark the store inactive instead.",
      },
    ],
    related: ["common-tasks", "glossary", "operations-runbook"],
  },
];
