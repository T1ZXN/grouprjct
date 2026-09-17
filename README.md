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
3. Set the matching Vite client-env key in the build environment (see the table below).
   A registered provider with `keyName` set to the configured key becomes the
   active provider automatically; `isLiveMode()` then reports live and the UI
   swaps its labels. No component or route changes are needed.
### Live providers (implemented — switch on with a key)
| Env var (site Secrets) | Provider file | What it enables |
|------------------------|---------------|-----------------|
| `VITE_REG_LOOKUP_KEY` | `src/lib/reglookup-ukvrm.ts` | Live **plate → vehicle** lookup (UK registration API; DVLA record + model). |
| `VITE_FITS_API_KEY` | `src/lib/reglookup-fits.ts` | Live **vehicle → wheel fitting options** (licensed fitment database: diameter/width/PCD/offset). |
| `VITE_REG_LOOKUP_URL` *(optional)* | `reglookup-ukvrm.ts` | Override the plate-lookup endpoint (default VehicleMatic-style `https://api.vehiclematic.com/v1/vehicle`). |
| `VITE_REG_LOOKUP_AUTH` *(optional)* | `reglookup-ukvrm.ts` | `bearer` (default) or `x-api-key`, matching the provider's auth header. |
| `VITE_FITS_API_URL` *(optional)* | `reglookup-fits.ts` | Override the fitment endpoint (default licensed-database search-by-model URL). |
`src/lib/reglookup-live.ts` composes whichever capabilities are keyed: both →
live plate match + live fitments; reg only → live plate match with **clearly
labelled sample** fitment options; fits only → live fitments and an honest "plate
decoding not connected" message. Nothing fabricates a vehicle or a fitment:
provider errors surface as errors, a 404 is an honest "no-match", and an empty
fitment result is reported as no records. A built-in cap of 40 live lookups per
browser session limits the cost of a leaked browser-side key.
- Provider shortlist, live prices and sign-up links: `/home/team/shared/reg-provider-shortlist.md`.
- Adapter tests (mapping, live/demo gating, error honesty): `bun run test:reglookup`.

The site builds and runs with NO `.env` file at all — missing keys simply mean
demo mode.

## Basket & checkout (payment seam)
- `src/lib/basket.ts` — basket model: lines, quantities and settings-driven order
  totals (delivery tiers, VAT already inside the displayed prices).
- `src/components/BasketProvider.tsx` — client basket state, persisted in
  localStorage (`n2wheels.basket.v1`); the header badge and product pages use it.
- `/basket` — line items, quantity controls, delivery/VAT/total panel.
- `/checkout` — order summary + UK delivery/contact form. **No card fields exist
  on this page** and it can never show a success screen or an order number.
- `src/lib/checkout.ts` — the payment seam (same pattern as `reglookup.ts`).
  With nothing configured it uses `enquiryProvider`, which hands the order to
  `enquiry@n2wheels.co.uk` as a prepared email and says plainly that the site
  takes no online card payment yet. A hosted checkout URL supplied at build time
  (`VITE_CHECKOUT_URL`) activates a redirect provider instead — see the
  docblock for how a real provider is wired; no credential is invented here.
- Tests: `bun run test:basket`, `bun run test:checkout`.

## Status
MVP with labelled sample/demo products — no real stock or availability is
claimed, and compatibility is verified before any order is confirmed. Basket and
checkout are built behind the honest payment seam above (no online card payment
is taken until a real provider is configured), and the UK registration-lookup API
and the Forzza supplier feed (CSV/XML/XLS) hook in behind the structures already
built here.

Contact: enquiry@n2wheels.co.uk