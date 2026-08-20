type LandmarkPhotoProps = {
  destinationCity: string;
  landmarkTitle: string;
  alt: string;
  loading?: "eager" | "lazy";
  onLoad?: () => void;
};

export function LandmarkPhoto({
  destinationCity,
  landmarkTitle,
  alt,
  loading = "lazy",
  onLoad,
}: LandmarkPhotoProps) {
  const params = new URLSearchParams({
    city: destinationCity,
    landmark: landmarkTitle,
  });

  return (
    <img
      alt={alt}
      decoding="async"
      loading={loading}
      onLoad={onLoad}
      src={`/api/landmark-photo?${params.toString()}`}
    />
  );
}
