import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  DEMO_FITMENTS_NOTICE,
  DEMO_MAKES,
  DEMO_YEARS,
  DIAMETER_OPTIONS,
  getFitments,
  getProviderLabel,
  isLiveMode,
  lookupVehicleByReg,
  modelsForMake,
} from "~/lib/reglookup";
import type { FitmentOption, Vehicle } from "~/lib/reglookup";
import { CheckIcon } from "~/components/icons";

interface FitmentResult {
  vehicle: Vehicle | null;
  via: "registration" | "details";
  registration?: string;
  /** Fitting options returned for the resolved vehicle (demo or live). */
  options: FitmentOption[];
  /** Honest label shown with the result (e.g. sample fitment data). */
  notice: string;
  /** True when the plate couldn't be resolved (no live reg API configured). */
  regUnavailable: boolean;
}

/**
 * "Find The Right Wheels For Your Car" search — registration plate input,
 * make/model/year selects and a wheel-diameter select.
 *
 * Runs entirely on the vehicle-lookup provider layer (`src/lib/reglookup.ts`).
 * With no API key configured every result is DEMO data, clearly labelled:
 *   - a registration plate is NEVER turned into a fabricated vehicle — the
 *     layer returns "lookup not connected" and the customer stays on the
 *     manual path;
 *   - manual make/model/year searches return sample fitment options · always
 *     with the "Sample fitment data — we confirm compatibility before you
 *     order" notice.
 * When a real provider key is added (see reglookup.ts), live results flow in
 * with their own label through this same component — no redesign needed.
 */
export function FitmentSearch() {
  const [registration, setRegistration] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [diameter, setDiameter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitmentResult | null>(null);

  const models = make ? modelsForMake(make) : [];
  const live = isLiveMode();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const plate = registration.trim();
    if (!plate && !make) {
      setError("Enter your registration or choose a make to search.");
      return;
    }

    setBusy(true);
    try {
      if (plate) {
        const outcome = await lookupVehicleByReg(plate);
        if (outcome.status === "matched" && outcome.vehicle) {
          // Live provider resolved the plate → show its fitment options.
          const fits = await getFitments(
            outcome.vehicle.make,
            outcome.vehicle.model,
            outcome.vehicle.year,
            outcome.vehicle.variant,
          );
          setResult({
            vehicle: outcome.vehicle,
            via: "registration",
            registration: outcome.registration,
            options: fits.options,
            notice: fits.notice,
            regUnavailable: false,
          });
        } else {
          // No live reg API (or no match): honest notice, NO fabricated car.
          setResult({
            vehicle: null,
            via: "registration",
            registration: outcome.registration,
            options: [],
            notice: outcome.notice,
            regUnavailable: true,
          });
        }
      } else {
        const fits = await getFitments(
          make,
          model || (modelsForMake(make)[0] ?? ""),
          year ? Number(year) : undefined,
        );
        setResult({
          vehicle: { make: fits.make, model: fits.model, year: fits.year ?? 2021 },
          via: "details",
          options: fits.options,
          notice: fits.notice,
          regUnavailable: false,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setRegistration("");
    setMake("");
    setModel("");
    setYear("");
    setDiameter("");
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-coal p-4 sm:p-6" noValidate>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Registration */}
          <div className="md:col-span-3">
            <label htmlFor="fit-reg" className="field-label">
              UK registration (number plate)
            </label>
            <input
              id="fit-reg"
              type="text"
              value={registration}
              onChange={(e) => setRegistration(e.target.value.toUpperCase())}
              placeholder="e.g. AB12 CDE"
              className="field-input font-mono uppercase"
              autoComplete="off"
              aria-describedby="fit-reg-help"
            />
            <p id="fit-reg-help" className="mt-1.5 text-xs text-steel-dim">
              Or skip the plate and choose your car below. The plate lookup connects to a live UK
              database once a provider key is configured — until then, results are never invented,
              so use the manual path below.
            </p>
          </div>

          {/* Make */}
          <div>
            <label htmlFor="fit-make" className="field-label">
              Make
            </label>
            <select
              id="fit-make"
              value={make}
              onChange={(e) => {
                setMake(e.target.value);
                setModel("");
              }}
              className="field-input cursor-pointer"
            >
              <option value="">Select make</option>
              {DEMO_MAKES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label htmlFor="fit-model" className="field-label">
              Model
            </label>
            <select
              id="fit-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!make}
              className="field-input cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{make ? "Select model" : "Choose a make first"}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Year + Diameter */}
          <div className="grid grid-cols-2 gap-4 md:col-span-3">
            <div>
              <label htmlFor="fit-year" className="field-label">
                Year
              </label>
              <select
                id="fit-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="field-input cursor-pointer"
              >
                <option value="">Any year</option>
                {DEMO_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fit-diameter" className="field-label">
                Wheel size (diameter)
              </label>
              <select
                id="fit-diameter"
                value={diameter}
                onChange={(e) => setDiameter(e.target.value)}
                className="field-input cursor-pointer"
              >
                <option value="">Any size</option>
                {DIAMETER_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}"
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" disabled={busy} className="btn btn-red disabled:cursor-wait disabled:opacity-70">
            {busy ? "Searching…" : "Search"}
          </button>
          {result?.vehicle && (
            <Link to="/wheels" className="btn btn-outline">
              Browse all wheels
            </Link>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-sm text-race-bright">
            {error}
          </p>
        )}
      </form>

      {/* Result — reg lookup not connected (no fabricated vehicle, honest) */}
      {result?.regUnavailable && (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 sm:p-5" role="status">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Registration lookup</p>
          <p className="mt-2 text-sm leading-relaxed text-steel">{result.notice}</p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-steel-dim">
            <CheckIcon className="h-3.5 w-3.5" />
            We verify compatibility with your exact vehicle before confirming any order.
          </p>
          <button type="button" onClick={reset} className="mt-3 cursor-pointer text-xs text-steel underline-offset-2 hover:text-white hover:underline">
            Start again
          </button>
        </div>
      )}

      {/* Result — vehicle resolved (manual always; reg-matched when live) */}
      {result?.vehicle && (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 sm:p-5" role="status">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">{result.notice}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-bold text-white">
                {result.vehicle.make} {result.vehicle.model}{" "}
                <span className="text-steel">({result.vehicle.year})</span>
              </p>
              <p className="mt-0.5 text-sm text-steel">
                {result.via === "registration"
                  ? `Plate ${result.registration} — live match`
                  : "Manual search"}
                {diameter ? ` · ${diameter}" wheels` : ""}
              </p>
            </div>
            <Link
              to="/wheels"
              search={{ vehicle: `${result.vehicle.make} ${result.vehicle.model} (${result.vehicle.year})` }}
              className="btn btn-red shrink-0"
            >
              View wheels for this car
            </Link>
          </div>
          {result.options.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {result.options.slice(0, 5).map((o) => (
                <li
                  key={`${o.diameter}-${o.width}-${o.pcd}-${o.offset}`}
                  className="rounded-md border border-white/10 bg-coal px-2.5 py-1.5 text-xs text-steel"
                >
                  {o.diameter}" × {o.width} · {o.pcd} · {o.offset}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-steel-dim">
            <CheckIcon className="h-3.5 w-3.5" />
            We verify compatibility with your exact vehicle before confirming any order.
          </p>
          <button type="button" onClick={reset} className="mt-3 cursor-pointer text-xs text-steel underline-offset-2 hover:text-white hover:underline">
            Start again
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-steel-dim">
        Vehicle data source: {getProviderLabel()} ({live ? "live lookup" : "demo mode — no live lookup connected"}).
      </p>
      <p className="sr-only">{DEMO_FITMENTS_NOTICE}</p>
    </div>
  );
}