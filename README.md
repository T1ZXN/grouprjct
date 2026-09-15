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

## Status
MVP with labelled sample/demo products — no real stock or availability is
claimed, and compatibility is verified before any order is confirmed. Payment
checkout, UK registration-lookup API and the Forzza supplier feed (CSV/XML/XLS)
hook in behind the structures already built here.

Contact: enquiry@n2wheels.co.uk