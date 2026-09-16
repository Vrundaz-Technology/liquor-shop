"use client";

import Image, { type ImageProps } from "next/image";
import { isInlineImage } from "@/lib/image-file";
import { cn } from "@/lib/utils";

function shouldSkipOptimizer(url: string) {
  return (
    isInlineImage(url) ||
    url.startsWith("/uploads/") ||
    url.startsWith("blob:")
  );
}

export function SmartImage({
  src,
  alt,
  fill,
  className,
  style,
  sizes,
  priority,
  quality = 75,
  unoptimized,
}: Pick<
  ImageProps,
  "src" | "alt" | "fill" | "className" | "style" | "sizes" | "priority" | "quality" | "unoptimized"
>) {
  const url = typeof src === "string" ? src : "";
  if (url && isInlineImage(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn(fill && "absolute inset-0 h-full w-full", className)}
        style={style}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      style={style}
      sizes={sizes}
      priority={priority}
      quality={quality}
      unoptimized={unoptimized ?? (url ? shouldSkipOptimizer(url) : false)}
    />
  );
}
