import type { Metadata } from "next";

export const metadata: Metadata = { title: "Documentation" };

type Props = { params: Promise<{ topic: string }> };

export default async function DashboardDocsTopicPage({ params }: Props) {
  await params;
  return null;
}
