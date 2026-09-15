# N2 Wheels — website source

Premium UK e-commerce site for aftermarket alloy wheels, tyres, wheel & tyre
packages and accessories. Black / white / red automotive style (current theme:
charcoal + red), mobile-first.

## What's here
- `src/` — TanStack Start app (React 19 + Vite + Tailwind v4, SSR)
  - Catalogue: `/wheels` `/tyres` `/packages` `/accessories` (client filters,
    detail pages, "Will this fit my car?" fitment checker)
  - Pages: About, Contact, Delivery, Returns, FAQ, Privacy, Terms
  - Admin (`/admin`) — import supplier feed (CSV / XML / Excel .xls/.xlsx),
    central pricing settings, Supabase-backed catalogue when configured
- `public/images/` — logo (owner's new transparent logo), hero photo, product
  imagery, favicons
- `scripts/` — tooling: static export for Netlify (`export-netlify.ts`),
  regression tests (`verify-netlify.sh`), XLS fixture generator

## Run locally
```bash
bun install
bun run dev        # dev server
bun run build      # production build
bun run publish    # build + serve on :3000
```

## Static export for Netlify
```bash
bun run build && bun ./export-netlify.ts   # writes dist-netlify/ (prerendered)
./verify-netlify.sh                        # full regression: "40 passed, 0 failed"
```

## Vehicle lookup & fitment provider layer
All reg / fitment flows (hero search, `/fitment`, the per-product "Will this fit
my car?" checker) go through ONE seam: `src/lib/reglookup.ts`. Two functions:

- `lookupVehicleByReg(reg)` → `VehicleLookupOutcome` (UK plate → vehicle)
- `getFitments(make, model, year?, variant?)` → `FitmentsResult` (vehicle → wheel
  fitting options, PCD/offset/width/diameter)

### Demo mode (default — no API key)
With no key configured the layer uses the demo adapter in
`src/lib/reglookup-demo.ts` (the sample fleet + sample fitment profiles). It is
fully functional and clearly labelled:
- a registration plate is NEVER converted into a fabricated vehicle — the layer
  returns "lookup not connected" and the UI keeps the customer on the manual
  make/model/year path;
- every manual result carries the "Sample fitment data — we confirm exact
  compatibility with your exact vehicle before you order" notice.

### Going live (one adapter per provider)
1. Copy `reglookup-demo.ts` to e.g. `reglookup-boughto.ts` (fits API) or
   `reglookup-dvla.ts` (UK reg API) and implement the `VehicleDataProvider`
   interface (id, label, keyName, `lookupVehicleByReg`, `getFitments`).
2. `import` it and `registerProvider(...)` in `reglookup.ts` next to the demo
   registration (see the ═══ SEAM ═══ marker in `getActiveProvider()`).
3. Set the matching Vite client-env key in the build environment:
   - `VITE_REG_LOOKUP_KEY` — UK registration-lookup API key (plate → vehicle)
   - `VITE_FITS_API_KEY` — fitment-database API key (make/model → fits data)
   A registered provider with `keyName` set to the configured key becomes the
   active provider automatically; `isLiveMode()` then reports live and the UI
   swaps its labels. No component or route changes are needed.

The site builds and runs with NO `.env` file at all — missing keys simply mean
demo mode.

## Status
MVP with labelled sample/demo products — no real stock or availability is
claimed, and compatibility is verified before any order is confirmed. Payment
checkout, UK registration-lookup API and the Forzza supplier feed (CSV/XML/XLS)
hook in behind the structures already built here.

Contact: enquiry@n2wheels.co.uk