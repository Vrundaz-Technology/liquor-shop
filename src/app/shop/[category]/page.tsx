import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoryPage } from "./CategoryClient";
import { getCategories } from "@/data/categories";

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const meta = getCategories().find((item) => item.slug === category);
  if (!meta) {
    return { title: "Collection", robots: { index: false, follow: true } };
  }
  return {
    title: meta.name,
    description: meta.description || `Shop ${meta.name} at Sam's Discount Liquor.`,
  };
}

export default async function Page({ params }: Props) {
  await params;
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-3 py-16 text-sm text-muted sm:px-4 md:px-8">
          Loading collection…
        </div>
      }
    >
      <CategoryPage />
    </Suspense>
  );
}
