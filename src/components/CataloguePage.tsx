import type { ReactNode } from "react";
import { CatalogueFilters } from "~/components/CatalogueFilters";
import type { FilterField } from "~/components/CatalogueFilters";
import { DEMO_NOTICE } from "~/data/products";

export interface CataloguePageProps {
  title: string;
  blurb: string;
  fields: FilterField[];
  values: Record<string, string | undefined>;
  /** Keys that count toward the active-filter badge (excludes q/vehicle/sort). */
  filterKeys: string[];
  onChange: (key: string, value: string | undefined) => void;
  onClearAll: () => void;
  sortControl: ReactNode;
  /** Honesty banner title, e.g. "Showing sample wheels for BMW 3 Series (2018)". */
  vehicleBanner?: string;
  resultCount: number;
  emptyMessage: string;
  /** The product card grid (already filtered). */
  children: ReactNode;
}

/**
 * Shared shell for the four catalogue list pages: page header with the
 * sample-data chip, the ?vehicle= honesty banner, the responsive
 * filters/content layout, results toolbar and empty state. Each route supplies
 * its own filter config and card grid.
 */
export function CataloguePage({
  title,
  blurb,
  fields,
  values,
  filterKeys,
  onChange,
  onClearAll,
  sortControl,
  vehicleBanner,
  resultCount,
  emptyMessage,
  children,
}: CataloguePageProps) {
  const activeCount = filterKeys.filter((k) => values[k] !== undefined).length;

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-12 sm:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-steel sm:text-base">{blurb}</p>
          </div>
          <span className="sample-chip">Sample data</span>
        </div>

        {/* ?vehicle= honesty banner */}
        {vehicleBanner && (
          <div className="mt-6 rounded-xl border border-race/40 bg-race/10 p-4 sm:p-5" role="status">
            <p className="text-sm font-semibold text-white">{vehicleBanner}</p>
            <p className="mt-1 text-sm leading-relaxed text-steel">
              Demo data — we verify compatibility with your exact vehicle before confirming any order.
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-start">
          <CatalogueFilters
            fields={fields}
            values={values}
            onChange={onChange}
            onClearAll={onClearAll}
            activeCount={activeCount}
          />

          <div className="min-w-0 flex-1">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-steel">
                {resultCount} {resultCount === 1 ? "result" : "results"}
              </p>
              {sortControl}
            </div>

            {/* Results / empty state */}
            {resultCount > 0 ? (
              children
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-carbon p-10 text-center">
                <p className="text-base font-semibold text-white">{emptyMessage}</p>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="btn btn-red mt-5"
                >
                  Clear filters
                </button>
              </div>
            )}

            <p className="mt-8 text-xs text-steel-dim">{DEMO_NOTICE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}