export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;

const SOCIAL_IMAGE_VERSION = "20260901";

export function getSocialImagePath(citySlug?: string) {
  const searchParams = new URLSearchParams({ v: SOCIAL_IMAGE_VERSION });
  if (citySlug) {
    searchParams.set("city", citySlug);
  }

  return `/api/social-image?${searchParams.toString()}`;
}

export function getSocialImageMetadata(
  citySlug?: string,
  alt = "+352 Flights",
) {
  return {
    url: getSocialImagePath(citySlug),
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    alt,
    type: "image/png",
  };
}
