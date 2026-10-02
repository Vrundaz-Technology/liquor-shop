import type { Metadata } from "next";
import { LocationDetailPage } from "./LocationDetailClient";
import { fetchLocationBySlug } from "@/lib/db/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const loc = await fetchLocationBySlug(slug).catch(() => undefined);
  if (!loc || loc.active === false) {
    return { title: "Location", robots: { index: false, follow: true } };
  }
  return {
    title: loc.shortName,
    description: loc.description.slice(0, 160),
    openGraph: {
      title: loc.name,
      description: loc.description.slice(0, 160),
      images: loc.heroImage ? [{ url: loc.heroImage }] : undefined,
    },
  };
}

export default async function Page({ params }: Props) {
  await params;
  return <LocationDetailPage />;
}
