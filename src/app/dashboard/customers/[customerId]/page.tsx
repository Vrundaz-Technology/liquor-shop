import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customer record" };

type Props = { params: Promise<{ customerId: string }> };

export default async function DashboardCustomerRecordPage({ params }: Props) {
  await params;
  return null;
}
