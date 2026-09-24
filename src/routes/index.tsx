import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FitmentSearch } from "~/components/FitmentSearch";
import {
  CheckIcon,
  LayersIcon,
  LockIcon,
  ShieldIcon,
  StarIcon,
  TruckIcon,
  WrenchIcon,
} from "~/components/icons";
import {
  categories,
  DEMO_NOTICE,
  demoPackages,
  demoTypes,
  featuredWheels,
  tyreSizeLabel,
  wheelSizeLabel,
} from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { ProductCard, StockChip } from "~/components/ProductCard";

const WHY_CARDS = [
  {
    icon: WrenchIcon,
    title: "Vehicle Fitment",
    body: "We help you find wheels that are suitable for your vehicle.",
  },
  {
    icon: ShieldIcon,
    title: "Quality Products",
    body: "Quality aftermarket wheels and tyres from trusted suppliers.",
  },
  {
    icon: LayersIcon,
    title: "Complete Packages",
    body: "Choose wheels and tyres together for a complete setup.",
  },
  {
    icon: TruckIcon,
    title: "UK Delivery",
    body: "Products supplied to customers throughout the UK.",
  },
];

const TRUST_ITEMS = [
  {
    icon: ShieldIcon,
    title: "Quality assured products",
    body: "Aftermarket wheels and tyres from trusted suppliers.",
  },
  {
    icon: LockIcon,
    title: "Secure ordering",
    body: "Order details are confirmed with you before anything is processed.",
  },
  {
    icon: CheckIcon,
    title: "Sample catalogue — demo data",
    body: "Everything shown today is sample data while the real catalogue is built.",
  },
];

const CATEGORY_TO: Record<string, "/wheels" | "/tyres" | "/packages" | "/accessories"> = {
  wheels: "/wheels",
  tyres: "/tyres",
  packages: "/packages",
  accessories: "/accessories",
};

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://0db91f50521ace36d5f63f7aac07e858.ctonew.app/" }],
    meta: [
      {
        property: "og:title",
        content: "N2 Wheels | Alloy Wheels, Tyres & Wheel Packages UK",
      },
      {
        property: "og:description",
        content:
          "Premium UK aftermarket alloy wheels, tyres and wheel & tyre packages — find wheels that fit your car.",
      },
    ],
  }),
  component: Home,
});

function Hero() {
  return (
    <section className="relative overflow-hidden bg-night">
      <img
        src="/images/hero-n2.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />
      {/* Dark overlay + gradient so the headline always pops on the photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/30" />
      <div className="container-x relative py-24 sm:py-32 lg:py-40">
        <span className="sample-chip">Premium aftermarket tyres &amp; wheels · UK</span>
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
          Tyres That Fit. <span className="text-race-bright">Wheels That Stand Out.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-steel sm:text-lg">
          Shop performance tyres, aftermarket alloy wheels and complete wheel &amp; tyre packages
          for your car.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/tyres" className="btn btn-red">
            Shop Tyres
          </Link>
          <Link to="/wheels" className="btn btn-outline">
            Shop Wheels
          </Link>
          <Link to="/fitment" className="btn btn-ghost">
            Find My Fitment
          </Link>
        </div>
      </div>
    </section>
  );
}

function FitmentSection() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <div className="max-w-3xl">
          <h2 className="section-title uppercase tracking-wide">
            Find The Right Tyres &amp; Wheels For Your Car
          </h2>
          <p className="section-sub">
            Enter your UK registration, or pick your make, model and year — we'll show the tyres,
            wheels and packages our sample catalogue lists for your car, tyres first. Demo vehicle
            data until a live UK plate lookup is connected.
          </p>
        </div>
        <div className="mt-8 max-w-4xl">
          <FitmentSearch />
        </div>
      </div>
    </section>
  );
}

function PopularCategories() {
  return (
    <section className="border-t border-line bg-carbon">
      <div className="container-x py-16 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="section-title">Popular Categories</h2>
          <span className="sample-chip">Sample data</span>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to={CATEGORY_TO[c.slug]}
              className="group overflow-hidden rounded-xl border border-white/10 bg-coal transition-colors hover:border-race/60"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={c.image}
                  alt={c.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-white">{c.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-steel">{c.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-race-bright">
                  Shop now
                  <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedTyres() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Featured Tyres</h2>
            <p className="section-sub">
              Our main line — tyres in the sizes UK drivers buy most, matched to your car by
              registration or by make and model.
            </p>
          </div>
          <span className="sample-chip">Sample data</span>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {demoTypes.map((t) => (
            <ProductCard
              key={t.id}
              href={`/tyres/${t.id}`}
              image={t.image}
              imageAlt={`${t.brand} ${t.name} tyre ${tyreSizeLabel(t)}`}
              eyebrow={`${t.brand} · ${t.season}`}
              title={t.name}
              meta={[tyreSizeLabel(t), `${t.loadIndex} ${t.speedRating}`]}
              price={formatGBP(t.retailPriceIncVat)}
              stockStatus={t.stockStatus}
              dimmed={t.stockStatus === "Out of stock"}
            />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-steel-dim">{DEMO_NOTICE}</p>
          <Link to="/tyres" className="btn btn-outline !py-2.5">
            Shop all tyres
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturedWheels() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Featured Wheels</h2>
            <p className="section-sub">
              A first look at the sample catalogue — full filtering and fitment
              details arrive with the real product feed.
            </p>
          </div>
          <span className="sample-chip">Sample data</span>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredWheels.map((w) => (
            <article
              key={w.id}
              className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-carbon"
            >
              <div className="aspect-square overflow-hidden bg-coal">
                <img
                  src={w.image}
                  alt={`${w.brand} ${w.name} alloy wheel`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-steel">
                  {w.brand} · {w.colour}
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">{w.name}</h3>
                <p className="mt-1 text-sm text-steel">{wheelSizeLabel(w.size)}</p>
                <p className="mt-1 text-sm text-steel">{w.finish}</p>
                <p className="mt-3 text-xl font-bold text-white">
                  {formatGBP(w.retailPriceIncVat)}
                </p>
                <StockChip status={w.stockStatus} />
                <div className="mt-4 flex flex-1 items-end">
                  <Link to="/wheels/$id" params={{ id: w.id }} className="btn btn-outline w-full !py-2.5">
                    View
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-xs text-steel-dim">{DEMO_NOTICE}</p>
      </div>
    </section>
  );
}

function Packages() {
  return (
    <section className="border-t border-line bg-carbon">
      <div className="container-x py-16 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Wheel &amp; Tyre Packages</h2>
            <p className="section-sub">
              Wheels, tyres, valves and bolts together as a complete ready-to-fit set.
            </p>
          </div>
          <span className="sample-chip">Sample data</span>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {demoPackages.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-night"
            >
              <div className="aspect-[16/10] overflow-hidden">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-steel">
                  Complete {p.diameter}" wheel &amp; tyre setup
                </p>
                <ul className="mt-3 space-y-1.5">
                  {p.includes.slice(0, 2).map((line) => (
                    <li key={line} className="flex items-start gap-2 text-sm text-steel">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-race" />
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
                  <p className="text-xl font-bold text-white">{formatGBP(p.retailPriceIncVat)}</p>
                  <StockChip status={p.stockStatus} />
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-xs text-steel-dim">{DEMO_NOTICE}</p>
      </div>
    </section>
  );
}

function WhyChoose() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <h2 className="section-title">Why Choose N2 Wheels</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl border border-white/10 bg-carbon p-6">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-race/10 text-race-bright">
                <card.icon className="h-5.5 w-5.5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-steel">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FitmentExplainer() {
  return (
    <section className="border-t border-line bg-carbon">
      <div className="container-x py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="section-title text-center">Vehicle Compatibility &amp; Fitment</h2>
          <p className="section-sub mx-auto text-center">
            How fitment works at N2 Wheels — honest and verified, never assumed.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "We check tyre size and wheel geometry — diameter, width, PCD, offset and centre bore — against your vehicle's requirements before we recommend anything.",
              "We verify vehicle compatibility with your exact car before confirming any order. The fitment search is the first step of that check, not a guarantee.",
              "No universal fitting guarantee is claimed: some vehicles need spigot rings, different bolts or minor adjustments, and each setup is checked individually.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-steel">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-race" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <Link to="/fitment" className="btn btn-red">
              Find Tyres &amp; Wheels For My Car
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Reviews() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <h2 className="section-title">Customer Reviews</h2>
        <p className="section-sub">
          Real reviews will be collected on Google Reviews and Trustpilot once we
          start delivering orders.
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-carbon p-8 text-center sm:p-12">
          <StarIcon className="mx-auto h-9 w-9 text-steel-dim" />
          <p className="mt-5 text-sm leading-relaxed text-steel sm:text-base">
            Reviews coming soon — real customer reviews will appear here once we've delivered.
          </p>
          <p className="mt-2 text-xs text-steel-dim">
            Google Reviews &amp; Trustpilot · placeholder area
          </p>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="border-t border-line bg-carbon">
      <div className="container-x py-12 sm:py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 text-race-bright">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-steel">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) setDone(true);
  };

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="section-title">Stay in the loop</h2>
          <p className="section-sub mx-auto">Sign up for news, offers and new arrivals.</p>
          {done ? (
            <p className="mx-auto mt-8 inline-block rounded-md border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-300">
              Thanks — you're on the list.
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="field-input"
              />
              <button type="submit" className="btn btn-red shrink-0 !py-3">
                Subscribe
              </button>
            </form>
          )}
          <p className="mt-4 text-xs text-steel-dim">
            Demo form — no email service is connected yet, so nothing is sent or stored.
          </p>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return (
    <main>
      <Hero />
      <FitmentSection />
      <PopularCategories />
      <FeaturedTyres />
      <FeaturedWheels />
      <Packages />
      <WhyChoose />
      <FitmentExplainer />
      <Reviews />
      <TrustStrip />
      <Newsletter />
    </main>
  );
}