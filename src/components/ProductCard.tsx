import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { stockTone } from "~/data/products";
import type { StockStatus } from "~/data/products";

/**
 * Stock chip classes per status. Tailwind needs the utilities verbatim in
 * source, so this maps the stockTone VALUES from src/data/products.ts
 * (emerald-400 / amber-300 / race / steel) to real classes: bg-<tone>/10 +
 * text-<tone>. The lookup goes through stockTone so the two sources cannot
 * drift apart.
 */
const stockChipClass: Record<string, string> = {
  "emerald-400": "bg-emerald-400/10 text-emerald-400",
  "amber-300": "bg-amber-300/10 text-amber-300",
  race: "bg-race/10 text-race",
  steel: "bg-steel/10 text-steel",
};

export const chipFor = (status: StockStatus): string =>
  stockChipClass[stockTone[status]] ?? "bg-white/10 text-steel";

/** Small rounded status badge (In Stock / Available to order / Out of stock / Contact us). */
export function StockChip({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] font-semibold ${chipFor(status)}`}
    >
      {status}
    </span>
  );
}

export interface ProductCardProps {
  /** The "View" destination, e.g. "/wheels/w-forza-r1-18". */
  href: string;
  image: string;
  imageAlt: string;
  /** Small uppercase line above the title (brand · colour / size). */
  eyebrow?: string;
  title: string;
  /** Secondary lines under the title (size labels etc.). */
  meta?: string[];
  /** Formatted price, e.g. "£272.09". */
  price?: string;
  stockStatus: StockStatus;
  /** Visually dim the card (used for Out of stock — still shown, never purchasable-looking). */
  dimmed?: boolean;
  /** Extra content between the meta lines and the price row. */
  children?: ReactNode;
}

/**
 * Shared catalogue card: image (tappable), brand/name, spec meta, price,
 * stock chip and a "View" link. Used by the wheels / tyres / packages /
 * accessories list pages.
 */
export function ProductCard({
  href,
  image,
  imageAlt,
  eyebrow,
  title,
  meta,
  price,
  stockStatus,
  dimmed = false,
  children,
}: ProductCardProps) {
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-carbon transition-colors hover:border-race/50 ${
        dimmed ? "opacity-60 saturate-[0.7]" : ""
      }`}
    >
      <Link to={href} aria-label={imageAlt} className="block aspect-square overflow-hidden bg-coal">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-steel">{eyebrow}</p>
        )}
        <h3 className="mt-1 text-lg font-bold leading-snug text-white">{title}</h3>
        {meta?.map((line) => (
          <p key={line} className="mt-0.5 text-sm text-steel">
            {line}
          </p>
        ))}
        {children}
        <div className="mt-3 flex items-center justify-between gap-2">
          {price && <p className="text-xl font-bold text-white">{price}</p>}
          <StockChip status={stockStatus} />
        </div>
        <div className="mt-4 flex flex-1 items-end">
          <Link to={href} className="btn btn-outline w-full !py-2.5">
            View <span className="sr-only">{title}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}