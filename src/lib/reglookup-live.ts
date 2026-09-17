/**
 * N2 Wheels — LIVE COMPOSITE vehicle-data provider.
 *
 * The site has TWO live capabilities behind ONE seam:
 *   • plate -> vehicle       (src/lib/reglookup-ukvrm.ts, VITE_REG_LOOKUP_KEY)
 *   • vehicle -> fitments    (src/lib/reglookup-fits.ts,  VITE_FITS_API_KEY)
 *
 * `createLiveProvider({ reg, fits })` composes whatever is keyed and is selected
 * automatically by `getActiveProvider()` (src/lib/reglookup.ts) as soon as either
 * key is present — so pasting a key switches the site to live mode with no code
 * change. Rules:
 *
 *   • both keys  -> live plate match + live fitment options.
 *   • reg key    -> live plate match; fitment options fall back to the clearly
 *                   LABELLED sample data (notice says so explicitly, source "demo").
 *   • fits key   -> live fitment options; a plate cannot be decoded, so the plate
 *                   path returns an honest "not connected" outcome — never a
 *                   guessed vehicle.
 *
 * Nothing here ever fabricates a vehicle or a fitment: a missing capability
 * degrades to a labelled sample/honest-unavailable result, and provider errors
 * propagate as errors (the UI shows them; no fake data is substituted).
 */
import type {
  FitmentsResult,
  VehicleDataProvider,
  VehicleLookupOutcome,
} from "./reglookup";
import { demoGetFitments, DEMO_FITMENTS_NOTICE } from "./reglookup-demo";
import { FITS_ONLY_REG_NOTICE } from "./reglookup-fits";

/** Provider id of the composite (drives isLiveMode()). */
export const LIVE_PROVIDER_ID = "live";

/** Mixed-source notice: live vehicle, sample fitment options. */
export const LIVE_REG_DEMO_FITS_NOTICE =
  "Vehicle matched live from the UK registration record. The wheel fitting options below are SAMPLE data — no licensed fitment database is connected yet — and we confirm exact compatibility with your exact vehicle before you order.";

/** Honest label naming exactly which part of the vehicle data is live. */
export function liveProviderLabel(parts: { reg?: boolean; fits?: boolean }): string {
  if (parts.reg && parts.fits) return "Live UK registration lookup + licensed fitment data";
  if (parts.reg) return "Live UK registration lookup (fitment options still sample)";
  if (parts.fits) return "Live fitment data (vehicle search by make/model; no plate decoding)";
  return "Demo dataset";
}

export interface LiveProviderParts {
  reg?: VehicleDataProvider;
  fits?: VehicleDataProvider;
}

export function createLiveProvider(parts: LiveProviderParts): VehicleDataProvider {
  const label = liveProviderLabel({ reg: Boolean(parts.reg), fits: Boolean(parts.fits) });

  async function lookupVehicleByReg(reg: string): Promise<VehicleLookupOutcome> {
    if (parts.reg) return parts.reg.lookupVehicleByReg(reg);
    return {
      status: "unavailable",
      source: "live",
      providerId: LIVE_PROVIDER_ID,
      notice: FITS_ONLY_REG_NOTICE,
    };
  }

  async function getFitments(
    make: string,
    model: string,
    year?: number,
    variant?: string,
  ): Promise<FitmentsResult> {
    if (parts.fits) return parts.fits.getFitments(make, model, year, variant);
    // No fitment database keyed: served by the clearly-labelled sample dataset.
    const demo = await demoGetFitments(make, model, year, variant);
    return { ...demo, notice: LIVE_REG_DEMO_FITS_NOTICE || DEMO_FITMENTS_NOTICE };
  }

  return {
    id: LIVE_PROVIDER_ID,
    label,
    // No keyName: the composite is selected by getActiveProvider() when any live part is keyed.
    lookupVehicleByReg,
    getFitments,
  };
}
