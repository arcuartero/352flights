import { NextResponse } from "next/server";

import {
  deleteDestinationPhoto,
  uploadDestinationPhoto,
} from "@/lib/destination-photo-storage";
import { toDestinationSlug } from "@/lib/destination-slugs";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

function isAuthorized(request: Request) {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return true;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(
      authorization.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

    return user === expectedUser && password === expectedPassword;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const destinationCity = String(formData.get("destinationCity") ?? "").trim();
    const destinationSlug = String(formData.get("destinationSlug") ?? "").trim();
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
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

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
