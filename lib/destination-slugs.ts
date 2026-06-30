function normalizeDestinationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function toDestinationSlug(value: string) {
  return normalizeDestinationText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function matchesDestinationSlug(value: string, slug: string) {
  return toDestinationSlug(value) === slug;
}
