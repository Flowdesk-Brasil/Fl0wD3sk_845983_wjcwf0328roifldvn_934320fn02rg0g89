import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PUBLIC_LANDING_CACHE_HEADER } from "@/lib/http/publicCache";

const LOOP_DIRECTORY = path.join(process.cwd(), "public", "cdn", "loop");
const ALLOWED_EXTENSIONS = new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
]);

export async function GET() {
  try {
    const entries = await readdir(LOOP_DIRECTORY, { withFileTypes: true });

    const logos = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        const extension = path.extname(name).toLowerCase();
        return ALLOWED_EXTENSIONS.has(extension);
      })
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      )
      .map((name) => ({
        id: name,
        src: `/cdn/loop/${name}`,
        alt: path.parse(name).name,
      }));

    return NextResponse.json(
      { logos },
      { headers: { "Cache-Control": PUBLIC_LANDING_CACHE_HEADER } },
    );
  } catch {
    return NextResponse.json(
      { logos: [] },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } },
    );
  }
}
