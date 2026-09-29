/**
 * ProductImg — the shared <img> for product photos (catalogue cards, detail
 * hero images, basket/checkout line thumbnails).
 *
 * WHY: imported wheel photos live on the supplier's own CDN
 * (www.wolfrace.co.uk). That CDN returns 403 when the browser sends a Referer
 * header (hot-link protection keyed on the site origin) and 200 with NO
 * referer — so every external product photo failed to display with the
 * browser's default referrer policy. External image URLs therefore render with
 * referrerPolicy="no-referrer"; same-source paths (the site's own /images/…)
 * keep the browser default. Nothing else about the request changes, and local
 * images are unaffected.
 */
export function imgReferrerPolicy(src: string | undefined | null): "no-referrer" | undefined {
  return src && /^https?:\/\//i.test(src.trim()) ? "no-referrer" : undefined;
}

export interface ProductImgProps {
  src: string;
  alt: string;
  className?: string;
  /** Pass "lazy" for below-the-fold grids (catalogue cards). */
  loading?: "lazy" | "eager";
}

export function ProductImg({ src, alt, className, loading }: ProductImgProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy={imgReferrerPolicy(src)}
    />
  );
}
