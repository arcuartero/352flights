type LandmarkPhotoProps = {
  destinationCity: string;
  landmarkTitle: string;
  alt: string;
};

export function LandmarkPhoto({ destinationCity, landmarkTitle, alt }: LandmarkPhotoProps) {
  const params = new URLSearchParams({
    city: destinationCity,
    landmark: landmarkTitle,
  });

  return (
    <img
      alt={alt}
      decoding="async"
      loading="lazy"
      src={`/api/landmark-photo?${params.toString()}`}
    />
  );
}
