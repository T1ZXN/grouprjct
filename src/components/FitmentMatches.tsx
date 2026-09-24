/**
 * "What fits my car?" results — TYRES first, then wheels, then packages.
 *
 * Owner direction (2026-09-17): tyres are the main line and wheels the bonus
 * line, and one search must answer for both. This renders the dual-format
 * result set built by `src/lib/fitment-results.ts` (which uses the same
 * `checkVehicleFitment()` verdict as the product pages).
 *
 * HONESTY: every line comes from products' SAMPLE fitment records. A line with
 * no match says so — "not listed" when that product line holds sample records,
 * "no sample data yet" when it holds none — and both keep the real promise that
 * we verify compatibility with the exact vehicle before confirming any order.
 * Nothing here claims stock, availability or a universal fitment guarantee.
 */
import { Link } from "@tanstack/react-router";
import { tyreSizeLabel, wheelSizeLabel } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { noMatchMessage } from "~/lib/fitment-results";
import type { FitmentGroup, VehicleFitmentResults } from "~/lib/fitment-results";
import type { Tyre, Wheel, WheelPackage } from "~/data/products";

/** A product row as shown in the results (name, spec line, price). */
interface MatchRow {
  id: string;
  name: string;
  spec: string;
  price: number;
}

/** Detail route each line links into (typed so TanStack's router stays happy). */
type DetailRoute = "/tyres/$id" | "/wheels/$id" | "/packages/$id";

function MatchGroup({
  title,
  to,
  rows,
  group,
}: {
  title: string;
  to: DetailRoute;
  rows: MatchRow[];
  group: FitmentGroup<unknown>;
}) {
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-coal/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h3>
        <span className="sample-chip">
          {rows.length > 0
            ? `${rows.length} in our sample catalogue`
            : `${group.total} sample product${group.total === 1 ? "" : "s"} checked`}
        </span>
      </div>
      {rows.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={to}
                params={{ id: row.id }}
                className="flex h-full flex-col rounded-md border border-white/10 bg-night/60 p-3 transition-colors hover:border-race/60"
              >
                <span className="text-sm font-bold text-white">{row.name}</span>
                <span className="mt-0.5 text-xs text-steel">{row.spec}</span>
                <span className="mt-1 text-sm font-bold text-race-bright">
                  {formatGBP(row.price)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-steel">{noMatchMessage(group)}</p>
      )}
    </div>
  );
}

export function FitmentMatches({ result }: { result: VehicleFitmentResults }) {
  const vehicleLabel = `${result.make} ${result.model}`;
  return (
    <div className="mt-4">
      <MatchGroup
        title={`Tyres that fit ${vehicleLabel}`}
        to="/tyres/$id"
        group={result.tyres as FitmentGroup<unknown>}
        rows={result.tyres.items.map((t: Tyre) => ({
          id: t.id,
          name: `${t.brand} ${t.name}`,
          spec: `${tyreSizeLabel(t)} · ${t.season}`,
          price: t.retailPriceIncVat,
        }))}
      />
      <MatchGroup
        title={`Wheels that fit ${vehicleLabel}`}
        to="/wheels/$id"
        group={result.wheels as FitmentGroup<unknown>}
        rows={result.wheels.items.map((w: Wheel) => ({
          id: w.id,
          name: `${w.brand} ${w.name}`,
          spec: `${wheelSizeLabel(w.size)} · ${w.finish}`,
          price: w.retailPriceIncVat,
        }))}
      />
      <MatchGroup
        title={`Wheel and tyre packages that fit ${vehicleLabel}`}
        to="/packages/$id"
        group={result.packages as FitmentGroup<unknown>}
        rows={result.packages.items.map((p: WheelPackage) => ({
          id: p.id,
          name: p.name,
          spec: `${p.diameter}" wheel and tyre set`,
          price: p.retailPriceIncVat,
        }))}
      />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-steel-dim">
        Sample fitment data — we verify compatibility with your exact vehicle before
        confirming any order.
      </p>
    </div>
  );
}
