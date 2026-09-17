/**
 * "Will this fit my car?" — shared fitment checker for wheel and package
 * detail pages.
 *
 * Purposely the ONLY place that turns a product's sample fitment data into a
 * verdict, so wheels and packages can never drift apart in honesty. It renders
 * Make / Model / Year selects (reusing the demo fleet from the vehicle-lookup
 * provider layer — src/lib/reglookup.ts, the same source the homepage and
 * /fitment searches use) and, on "Check fitment", produces one of three honest
 * verdicts against the product's OWN sample fitment records:
 *
 *   - compatible  — the make+model matches a VehicleFitment record 👉 GREEN,
 *                   always labelled "based on our sample fitment data".
 *   - not-listed  — the product HAS sample fitment data but this vehicle isn't
 *                   in it 👉 AMBER, with the "we'll verify…" promise.
 *   - no-data     — the product has NO sample fitment data yet 👉 NEUTRAL,
 *                   same "we'll verify…" promise.
 *
 * The vehicle itself is identified THROUGH the provider layer
 * (`getFitments`), so the same seam carries the live UK registration lookup
 * (/fitment) and, later, a licensed fitment database: fitment options here are
 * clearly-labelled SAMPLE data, while the plate path on /fitment reads the live
 * UK registration record through the site's same-origin proxy. No verdict ever
 * claims universal fitment or guarantees anything — the plate lookup's result
 * never changes a verdict on this page.
 */
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { VehicleFitment } from "~/data/products";
import {
  DEMO_FITMENTS_NOTICE,
  DEMO_MAKES,
  DEMO_YEARS,
  getFitments,
  getProviderLabel,
  isLiveMode,
  modelsForMake,
} from "~/lib/reglookup";
import type { FitmentOption } from "~/lib/reglookup";

/** The three honest verdicts a check can produce. */
export type FitmentVerdict =
  | { kind: "compatible"; match: VehicleFitment }
  | { kind: "not-listed" }
  | { kind: "no-data" };

/** Human-readable "BMW 3 Series (F30, 2012–2018)" label for a fitment record. */
export function fitmentLabel(f: VehicleFitment): string {
  const parts = [f.make, f.model];
  if (f.generation) parts.push(`(${f.generation})`);
  const years =
    f.yearsStart !== undefined || f.yearsEnd !== undefined
      ? `, ${f.yearsStart ?? "?"}–${f.yearsEnd ?? "today"}`
      : "";
  return parts.join(" ") + years;
}

/**
 * THE honest verdict logic — keep it in this one place.
 *
 * A selected make+model matches when it equals a record's make+model
 * (case-insensitive). If the record defines a model-year range AND the user
 * picked a year, the year must fall inside the range; if the user said "Any
 * year" (or the record has no years) the year is ignored.
 */
export function checkVehicleFitment(
  fitments: VehicleFitment[] | undefined,
  make: string,
  model: string,
  year?: number,
): FitmentVerdict {
  const list = fitments ?? [];
  const mk = make.trim().toLowerCase();
  const md = model.trim().toLowerCase();
  const match = list.find((f) => {
    if (f.make.toLowerCase() !== mk || f.model.toLowerCase() !== md) return false;
    if (
      year !== undefined &&
      f.yearsStart !== undefined &&
      f.yearsEnd !== undefined &&
      (year < f.yearsStart || year > f.yearsEnd)
    ) {
      return false;
    }
    return true;
  });
  if (match) return { kind: "compatible", match };
  return list.length > 0 ? { kind: "not-listed" } : { kind: "no-data" };
}

interface FitmentCheckerProps {
  /** The product's SAMPLE model-level fitment records (may be empty/undefined). */
  fitments: VehicleFitment[] | undefined;
  /** Make-level compatibility list (e.g. wheel.vehicleCompatibility) — optional. */
  makes?: string[];
  /** Product name for the heading context, e.g. "Forzza Forza R1". */
  productName: string;
  /** Extra node rendered under the checker (e.g. fitting info link). */
  children?: ReactNode;
}

export function FitmentChecker({ fitments, makes, productName, children }: FitmentCheckerProps) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [verdict, setVerdict] = useState<FitmentVerdict | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Fitting options for the chosen vehicle, from the provider layer. */
  const [vehicleFits, setVehicleFits] = useState<FitmentOption[] | null>(null);
  const models = make ? modelsForMake(make) : [];
  const live = isLiveMode();
  const providerLabel = getProviderLabel();

  const resetSelection = (nextMake: string) => {
    setMake(nextMake);
    setModel("");
    setYear("");
    setVerdict(null);
    setChecked(false);
    setVehicleFits(null);
  };

  const handleCheck = async (e: FormEvent) => {
    e.preventDefault();
    if (!make || !model) return; // submit is disabled until both are chosen
    setBusy(true);
    const yearNum = year ? Number(year) : undefined;
    setVerdict(checkVehicleFitment(fitments, make, model, yearNum));
    setChecked(true);
    setVehicleFits(null);
    try {
      const fits = await getFitments(make, model, yearNum);
      setVehicleFits(fits.options);
    } catch {
      // Provider hiccup — the verdict still stands; options are a bonus.
      setVehicleFits(null);
    } finally {
      setBusy(false);
    }
  };

  const list = fitments ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <div className="border-b border-line bg-coal/60 px-5 py-3.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">
          Will this fit my car?
        </h2>
      </div>
      <div className="p-5">
        <p className="text-sm leading-relaxed text-steel">
          Choose your car and we&apos;ll tell you whether {productName} is listed in our sample
          fitment data — before we ever confirm an order.
        </p>
        {makes && makes.length > 0 && (
          <p className="mt-2 text-xs text-steel-dim">
            Make-level sample guidance for this product: {makes.join(", ")}. Model-level checks
            below are the sample fitment data.
          </p>
        )}
        <form onSubmit={handleCheck} className="mt-5 grid gap-4 sm:grid-cols-3" noValidate>
          <div>
            <label htmlFor="fc-make" className="field-label">
              Make
            </label>
            <select
              id="fc-make"
              value={make}
              onChange={(e) => resetSelection(e.target.value)}
              className="field-input"
            >
              <option value="">Choose make…</option>
              {DEMO_MAKES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fc-model" className="field-label">
              Model
            </label>
            <select
              id="fc-model"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setVerdict(null);
                setChecked(false);
                setVehicleFits(null);
              }}
              className="field-input"
              disabled={!make}
            >
              <option value="">{make ? "Choose model…" : "Pick a make first"}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fc-year" className="field-label">
              Year <span className="normal-case text-steel-dim">(optional)</span>
            </label>
            <select
              id="fc-year"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setVerdict(null);
                setChecked(false);
                setVehicleFits(null);
              }}
              className="field-input"
            >
              <option value="">Any year</option>
              {DEMO_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="btn btn-red w-full sm:w-auto"
              disabled={!make || !model || busy}
            >
              {busy ? "Checking…" : "Check fitment"}
            </button>
            <button
              type="button"
              className="btn btn-ghost mt-2 sm:ml-3 sm:mt-0"
              onClick={() => {
                resetSelection("");
              }}
            >
              Reset
            </button>
            <Link to="/fitment" className="link-muted ml-0 mt-2 inline-flex items-center gap-1 text-[13px] sm:ml-4 sm:mt-0">
              Search by registration plate on the fitment page ›
            </Link>
          </div>
        </form>

        {verdict && checked && <VerdictCard verdict={verdict} />}

        {checked && vehicleFits && vehicleFits.length > 0 && (
          <div className="mt-4 rounded-lg border border-white/10 bg-coal/50 p-4">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-steel">
              <span className="sample-chip">Sample fitment data</span>
              Vehicle fitting options {live ? "" : "(demo)"}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {vehicleFits.slice(0, 6).map((o) => (
                <li
                  key={`${o.diameter}-${o.width}-${o.pcd}-${o.offset}`}
                  className="rounded-md border border-white/10 bg-coal px-2.5 py-1.5 text-xs text-steel"
                >
                  {o.diameter}" × {o.width} · {o.pcd} · {o.offset}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-steel-dim">
              {DEMO_FITMENTS_NOTICE} Provided by {providerLabel}.
            </p>
          </div>
        )}

        {list.length > 0 && (
          <div className="mt-6 rounded-lg border border-white/10 bg-coal/50 p-4">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-steel">
              <span className="sample-chip">Sample fitment data</span>
              {list.length} vehicle{list.length === 1 ? "" : "s"} listed
            </p>
            <ul className="mt-3 space-y-1.5">
              {list.map((f) => (
                <li key={fitmentLabel(f)} className="text-sm text-steel">
                  · {fitmentLabel(f)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-steel-dim">Demo records only — never a fitment guarantee.</p>
          </div>
        )}

        <p className="mt-5 text-xs leading-relaxed text-steel-dim">
          Fitment shown is sample data. We always check geometry and compatibility against your
          exact vehicle before confirming any order — reducing the chance of incorrect orders and
          returns. Vehicle data source: {providerLabel} ({live ? "live lookup" : "demo mode"}).
        </p>
        {children}
      </div>
    </div>
  );
}

/** Coloured verdict card — green / amber / neutral, always honest copy. */
function VerdictCard({ verdict }: { verdict: FitmentVerdict }) {
  if (verdict.kind === "compatible") {
    return (
      <div className="mt-5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-4">
        <p className="text-sm font-bold text-emerald-300">
          Compatible — based on our sample fitment data
        </p>
        <p className="mt-1 text-sm leading-relaxed text-emerald-100/80">
          {fitmentLabel(verdict.match)} is listed for this product in our sample fitment
          data. This is demo guidance, not a guarantee — we verify the geometry of your exact
          vehicle (PCD, offset, centre bore, brake clearance) before confirming your order.
        </p>
      </div>
    );
  }
  if (verdict.kind === "not-listed") {
    return (
      <div className="mt-5 rounded-lg border border-amber-300/40 bg-amber-300/10 p-4">
        <p className="text-sm font-bold text-amber-200">
          Not listed for this vehicle in our sample data — we&apos;ll verify compatibility with
          your exact vehicle before confirming your order.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-lg border border-white/10 bg-coal p-4">
      <p className="text-sm font-bold text-steel">
        No sample fitment data for this product yet — we&apos;ll verify compatibility with your
        exact vehicle before confirming your order.
      </p>
    </div>
  );
}