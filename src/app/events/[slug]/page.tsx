import type { Metadata } from "next";
import { EventDetailPage } from "./EventDetailClient";
import { fetchEventBySlug, fetchLocationById } from "@/lib/db/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug).catch(() => undefined);
  const store = event ? await fetchLocationById(event.locationId).catch(() => undefined) : undefined;
  if (!event || event.active === false || store?.active === false) {
    return { title: "Event", robots: { index: false, follow: true } };
  }
  const description = event.description.slice(0, 160);
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      images: event.image ? [{ url: event.image }] : undefined,
    },
  };
}

export default async function Page({ params }: Props) {
  await params;
  return <EventDetailPage />;
}
