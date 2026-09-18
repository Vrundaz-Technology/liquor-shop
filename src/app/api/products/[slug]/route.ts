import { NextResponse } from "next/server";
import { fetchProductBySlug } from "@/lib/db/queries";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const product = await fetchProductBySlug(slug);
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const { costPrice: _cost, ...publicProduct } = product;
    return NextResponse.json({ product: publicProduct });
  } catch (error) {
    console.error("[GET /api/products/[slug]]", error);
    return NextResponse.json({ error: "Failed to fetch product." }, { status: 500 });
  }
}
