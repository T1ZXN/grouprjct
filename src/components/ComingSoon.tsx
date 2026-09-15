import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * On-brand placeholder page for routes whose full content arrives in a later
 * milestone. Keeps the nav free of 404s and signals the honest build state.
 */
export function ComingSoon({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="bg-night">
      <div className="container-x py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="sample-chip">In development</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-steel sm:text-base">{description}</p>
          <p className="mt-3 text-xs text-steel-dim">
            Being built in the next milestone — the link works so the site navigation never breaks.
          </p>
          {children}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/" className="btn btn-outline">
              Back to home
            </Link>
            <Link to="/fitment" className="btn btn-red">
              Find Wheels For My Car
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}