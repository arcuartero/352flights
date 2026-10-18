import Image from "next/image";

/**
 * The source PNG is 1633×497 (95 KB); next/image serves a resized AVIF/WebP.
 * CSS sets the rendered height, so width/height here only fix the aspect ratio.
 */
export function BrandLogo({
  alt = "352 Flights",
  className,
  priority = false,
  width = 1633,
  height = 497,
}: {
  alt?: string;
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <Image
      alt={alt}
      className={className}
      height={height}
      priority={priority}
      quality={82}
      sizes="180px"
      src="/v2-logo.png"
      width={width}
    />
  );
}
