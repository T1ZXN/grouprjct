import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Shared layout for long-form content pages (about, delivery, guides…).
 * Dark, on-brand (bg-night / bg-carbon / steel text / red accents), clean and
 * mobile-first. Content is rendered in a single readable column; each section
 * is an h2 with an optional lead paragraph.
 */
export function ContentPage({
  title,
  intro,
  chip = "N2 Wheels",
  children,
}: {
  title: string;
  intro?: string;
  chip?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <span className="sample-chip">{chip}</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
          {intro ? (
            <p className="mt-4 text-base leading-relaxed text-steel sm:text-lg">{intro}</p>
          ) : null}
          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** A titled content block: h2 + optional lead + body content. */
export function ContentSection({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
      {lead ? (
        <p className="mt-2 text-sm leading-relaxed text-steel sm:text-base">{lead}</p>
      ) : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

/** Body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-steel sm:text-base">{children}</p>;
}

/** Bullet list of body text. */
export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-steel sm:text-base">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Red-tinted callout for honest, important notes (never a guarantee box). */
export function NoteBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
      {title ? <p className="font-semibold text-white">{title}</p> : null}
      <div className={title ? "mt-1.5 space-y-1.5" : "space-y-1.5"}>{children}</div>
    </div>
  );
}

/** Email link with the brand underline treatment — mailto only, no fake sending. */
export function MailLink({ email = "enquiry@n2wheels.co.uk" }: { email?: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="font-semibold text-white underline decoration-race decoration-2 underline-offset-4 hover:text-race-bright"
    >
      {email}
    </a>
  );
}

/** End-of-page CTA used on informational pages. */
export function PageCta({
  primaryTo = "/fitment",
  primaryLabel = "Find Wheels For My Car",
  secondaryTo,
  secondaryLabel,
}: {
  primaryTo?: string;
  primaryLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-carbon p-6 sm:p-8">
      <p className="text-lg font-bold tracking-tight text-white">Ready to find wheels that fit?</p>
      <p className="mt-2 text-sm leading-relaxed text-steel">
        Browse the sample catalogue or start with your car&apos;s details — we verify
        compatibility with your exact vehicle before confirming any order.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link to={primaryTo} className="btn btn-red">
          {primaryLabel}
        </Link>
        {secondaryTo && secondaryLabel ? (
          <Link to={secondaryTo} className="btn btn-outline">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Small "back to top / related page" link row. */
export function RelatedLinks({ links }: { links: { label: string; to: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="link-muted font-medium">
          {l.label} →
        </Link>
      ))}
    </div>
  );
}