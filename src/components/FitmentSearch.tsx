import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  DEMO_LOOKUP_NOTICE,
  DEMO_MAKES,
  DEMO_YEARS,
  DIAMETER_OPTIONS,
  lookupByDetails,
  lookupByRegistration,
  modelsForMake,
} from "~/lib/vehicleLookup";
import type { Vehicle } from "~/lib/vehicleLookup";
import { CheckIcon } from "~/components/icons";

interface FitmentResult {
  vehicle: Vehicle;
  via: "registration" | "details";
  registration?: string;
  notice: string;
}

/**
 * "Find The Right Wheels For Your Car" search — registration plate input,
 * make/model/year selects and a wheel-diameter select.
 *
 * Runs entirely on the `vehicleLookup` abstraction (src/lib/vehicleLookup.ts).
 * Until the real UK registration API is connected every result is demo data
 * and is labelled as such. A successful search routes the customer to
 * /wheels?vehicle=<make+model> so the (future) catalogue can filter on it.
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
        const res = await lookupByRegistration(plate);
        setResult({
          vehicle: res.vehicle,
          via: "registration",
          registration: res.registration,
          notice: res.notice,
        });
      } else {
        const res = await lookupByDetails({
          make,
          model: model || undefined,
          year: year ? Number(year) : undefined,
          diameter: diameter ? Number(diameter) : undefined,
        });
        setResult({ vehicle: res.vehicle, via: "details", notice: res.notice });
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
              Or skip the plate and choose your car below — the plate lookup connects to a live UK
              database soon (results are demo data until then).
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
          {result && (
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

      {/* Result — always demo until the reg API is connected */}
      {result && (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 sm:p-5" role="status">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
            {result.notice}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-bold text-white">
                {result.vehicle.make} {result.vehicle.model}{" "}
                <span className="text-steel">({result.vehicle.year})</span>
              </p>
              <p className="mt-0.5 text-sm text-steel">
                {result.via === "registration"
                  ? `Plate ${result.registration} — demo match`
                  : "Manual search — demo match"}
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
        Vehicle data shown by this tool is demo data — no live registration lookup is connected yet.
      </p>
      <p className="sr-only">{DEMO_LOOKUP_NOTICE}</p>
    </div>
  );
}