import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offer usage" };

type Props = { params: Promise<{ promoId: string }> };

export default async function DashboardPromotionUsagePage({ params }: Props) {
  await params;
  return null;
}
