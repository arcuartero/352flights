import { NextResponse } from "next/server";

import { listDestinationPhotos } from "@/lib/destination-photo-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const photos = await listDestinationPhotos();
    return NextResponse.json(
      {
        photos: Object.fromEntries(
          photos.map((photo) => [
            photo.slug,
            {
              url: photo.url,
              updatedAt: photo.updatedAt,
              size: photo.size,
              contentType: photo.contentType,
            },
          ]),
        ),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        photos: {},
        error:
          error instanceof Error
            ? error.message
            : "Destination photos could not be loaded.",
      },
      { status: 500 },
    );
  }
}
