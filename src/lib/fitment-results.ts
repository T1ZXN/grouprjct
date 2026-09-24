/**
 * N2 Wheels — "what fits this car?" across BOTH main lines.
 *
 * Owner direction (2026-09-17): tyres are the main sales product and wheels are
 * the bonus line, and the make/model/year (and, when the live provider resolves
 * one, registration-plate) search must answer for BOTH. This module is the one
 * place that turns a vehicle into tyres AND wheels AND packages, using the SAME
 * `checkVehicleFitment()` verdict logic the product pages use, so the search
 * result and the product-page verdict can never disagree.
 *
 * ⚠️ Every verdict here comes from products' SAMPLE fitment records. Nothing is
 * invented: a category with no match reports "not listed", and a category that
 * carries no sample records at all reports "no sample data yet" — both with the
 * real promise that we verify compatibility with the exact vehicle before
 * confirming any order. The catalogue is the sample catalogue (the same rows the
 * product pages prerender); live database rows do not change a verdict here.
 */
import { checkVehicleFitment } from "~/components/FitmentChecker";
import { demoPackages, demoTypes, demoWheels } from "~/data/products";
import type { Tyre, Wheel, WheelPackage } from "~/data/products";

/** One category's answer for the selected vehicle. */
export interface FitmentGroup<T> {
  /** Products whose SAMPLE fitment records list this exact vehicle. */
  items: T[];
  /** How many products in this category carry sample fitment records at all. */
  withRecords: number;
  /** How many products in this category exist in the sample catalogue. */
  total: number;
}

/** The dual-line answer for one vehicle: tyres first, then wheels. */
export interface VehicleFitmentResults {
  make: string;
  model: string;
  year?: number;
  tyres: FitmentGroup<Tyre>;
  wheels: FitmentGroup<Wheel>;
  packages: FitmentGroup<WheelPackage>;
}

/** Products of one category that this vehicle is listed for, plus the record counts. */
function group<T extends { vehicleFitments?: { make: string; model: string }[] }>(
  products: T[],
  make: string,
  model: string,
  year?: number,
): FitmentGroup<T> {
  const withRecords = products.filter((p) => (p.vehicleFitments ?? []).length > 0).length;
  const items = products.filter(
    (p) => checkVehicleFitment(p.vehicleFitments, make, model, year).kind === "compatible",
  );
  return { items, withRecords, total: products.length };
}

/**
 * Tyres, wheels and packages that fit `make` `model` (optionally a `year`) in
 * our SAMPLE fitment data. Safe to call with any make/model — an unknown vehicle
 * simply yields empty groups (never a fabricated match).
 */
export function fitmentResultsFor(vehicle: {
  make: string;
  model: string;
  year?: number;
}): VehicleFitmentResults {
  const { make, model, year } = vehicle;
  return {
    make,
    model,
    year,
    tyres: group(demoTypes, make, model, year),
    wheels: group(demoWheels, make, model, year),
    packages: group(demoPackages, make, model, year),
  };
}

/**
 * The honest sentence for a group with no matches: distinguishes "this product
 * type has sample records but not for your car" from "we hold no sample records
 * for this product type yet". Both keep the verify-before-confirming promise.
 */
export function noMatchMessage(group: { withRecords: number; total: number }): string {
  if (group.withRecords === 0) {
    return "No sample fitment data for this line yet — we verify compatibility with your exact vehicle before confirming your order.";
  }
  return "Not listed for this vehicle in our sample fitment data — we verify compatibility with your exact vehicle before confirming your order.";
}
