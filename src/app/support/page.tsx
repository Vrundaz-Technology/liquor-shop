import type { Metadata } from "next";
import { CustomerSupportCenter } from "@/components/support/CustomerSupportCenter";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-10 sm:px-4 sm:py-14 md:px-8">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Help</p>
      <h1 className="mt-2 font-display text-3xl text-cream sm:text-4xl">Support center</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Open a ticket for order, delivery, refund, payment, or account help. We route it
        automatically to the right store, owner, or platform team.
      </p>
      <div className="mt-8">
        <CustomerSupportCenter />
      </div>
    </div>
  );
}
