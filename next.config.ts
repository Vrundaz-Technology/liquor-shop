import type { NextConfig } from "next";

/** Turbopack can poison the on-disk image LRU in dev; keep optimizer for production. */
const disableImageOptimizer =
  process.env.NEXT_IMAGE_UNOPTIMIZED === "1" ||
  process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  images: {
    unoptimized: disableImageOptimizer,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "modelviewer.dev" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "static.specsonline.com" },
      { protocol: "https", hostname: "cdn.specsonline.com" },
      { protocol: "https", hostname: "images.liquorapps.com" },
      { protocol: "https", hostname: "www.totalwine.com" },
    ],
  },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "framer-motion"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
