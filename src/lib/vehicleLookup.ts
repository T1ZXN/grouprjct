/**
 * @deprecated BACKWARD-COMPAT SHIM — all vehicle/fitment logic now lives in
 * src/lib/reglookup.ts (provider layer) and src/lib/reglookup-demo.ts (demo
 * dataset). This module exists so existing imports (e.g. the catalogue's
 * `DEMO_MAKES` usage) keep working unchanged. New code should import from
 * `~/lib/reglookup` directly.
 *
 * The old stub functions `lookupByRegistration` / `lookupByDetails` are
 * provided by reglookup.ts as thin wrappers over the provider layer so nothing
 * that referenced them breaks; their results carry the honest demo label.
 */
export * from "./reglookup";
export {};