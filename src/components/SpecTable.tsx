import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export interface SpecRow {
  label: string;
  value: ReactNode;
}

/**
 * Small dark spec table used by the product detail pages (wheels / tyres /
 * packages). Renders label/value rows on a raised card.
 */
export function SpecTable({ rows, title }: { rows: SpecRow[]; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
        {title}
      </h2>
      <dl className="divide-y divide-white/5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-6 px-5 py-3">
            <dt className="text-sm text-steel">{row.label}</dt>
            <dd className="text-right text-sm font-semibold text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Breadcrumb trail above the detail hero, e.g. Home / Wheels / Forza R1. */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-steel-dim">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>›</span>}
            {item.to ? (
              <Link to={item.to} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ) : (
              <span className="text-steel">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}