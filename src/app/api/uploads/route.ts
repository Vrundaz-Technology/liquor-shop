import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/auth/require";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 6 * 1024 * 1024;

function sniffImage(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    // Any signed-in user may upload (avatars for customers; catalog images for staff).
    const { error } = await requireUser();
    if (error) return error;
    const limited = rateLimit(`uploads:${clientIp(request)}`, { limit: 20, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many uploads. Try again shortly.");
    }
    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "");
    const support = purpose === "support";
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }
    const maxBytes = support ? MAX_SUPPORT_BYTES : MAX_BYTES;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: support ? "Attachment must be under 6 MB." : "Image must be under 4 MB after resize." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const imageKind = sniffImage(buffer);
    const isPdf = support && buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF";
    if (!imageKind && !isPdf) {
      return NextResponse.json(
        {
          error: support
            ? "Please upload a JPG, PNG, WebP, or PDF."
            : "Please upload a JPG, PNG, or WebP image.",
        },
        { status: 400 },
      );
    }
    const kind = imageKind ?? "pdf";
    const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${kind}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);
    return NextResponse.json({
      url: `/uploads/${name}`,
      name: file.name || name,
      type: kind === "pdf" ? "application/pdf" : `image/${kind === "jpg" ? "jpeg" : kind}`,
      size: buffer.length,
    });
  } catch (error) {
    console.error("[POST /api/uploads]", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}
