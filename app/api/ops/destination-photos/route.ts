import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextResponse } from "next/server";

import {
  deleteDestinationPhoto,
  uploadDestinationPhoto,
} from "@/lib/destination-photo-storage";
import { toDestinationSlug } from "@/lib/destination-slugs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const destinationCity = String(
      formData.get("destinationCity") ?? "",
    ).trim();
    const destinationSlug = String(
      formData.get("destinationSlug") ?? "",
    ).trim();
    const file = formData.get("photo");
    const slug = destinationSlug || toDestinationSlug(destinationCity);

    if (!slug || !destinationCity) {
      return NextResponse.json(
        { error: "Destination city and slug are required." },
        { status: 400 },
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Choose an image file before uploading." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const photo = await uploadDestinationPhoto({
      slug,
      bytes,
      contentType: file.type,
    });

    return NextResponse.json({
      message: `${destinationCity} photo uploaded.`,
      photo,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Destination photo could not be uploaded.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const slug = String(searchParams.get("slug") ?? "").trim();
    if (!slug) {
      return NextResponse.json(
        { error: "Destination slug is required." },
        { status: 400 },
      );
    }

    await deleteDestinationPhoto(slug);
    return NextResponse.json({ message: "Destination photo removed." });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Destination photo could not be removed.",
      },
      { status: 500 },
    );
  }
}
