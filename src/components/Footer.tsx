import { Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, FOOTER_COLUMNS, SOCIALS } from "~/lib/nav";
import { MailIcon, MapPinIcon, PhoneIcon, SocialIcon } from "~/components/icons";

/**
 * Site footer (every page). Link columns + contact + social placeholders +
 * the small sample-data honesty note.
 */
export function Footer() {
  return (
    <footer className="border-t border-line bg-night">
      <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        {/* Brand + contact */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            {/* Owner's official logo (transparent web version) */}
            <img
              src="/images/logo-n2.png"
              alt="N2 Wheels"
              width={480}
              height={410}
              className="h-10 w-auto"
            />
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-steel">
            Premium aftermarket alloy wheels, tyres and complete wheel &amp; tyre
            packages for UK drivers.
          </p>

          <div className="mt-6 space-y-2.5 text-sm">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 text-steel transition-colors hover:text-white"
            >
              <MailIcon className="h-4 w-4 text-race" />
              {CONTACT_EMAIL}
            </a>
            <p className="flex items-center gap-2 text-steel">
              <PhoneIcon className="h-4 w-4 text-race" />
              Phone — details coming soon
            </p>
            <p className="flex items-center gap-2 text-steel">
              <MapPinIcon className="h-4 w-4 text-race" />
              245a Glasgow Road, G73 1SU
            </p>
          </div>

          <ul className="mt-6 flex items-center gap-2">
            {SOCIALS.map((s) => (
              <li key={s.icon}>
                <a
                  href={s.href}
                  aria-label={s.label}
                  className="grid h-10 w-10 place-items-center rounded-md border border-white/10 text-steel transition-colors hover:border-race hover:text-white"
                >
                  <SocialIcon name={s.icon} className="h-4.5 w-4.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Link columns */}
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={`Footer — ${col.title}`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  <Link to={l.to} className="link-muted text-sm">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-steel-dim sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} N2 Wheels. All rights reserved.</p>
          <p>
            Sample/demo data — products shown are examples; no live stock,
            availability or supplier pricing is claimed.
          </p>
          <Link to="/admin" className="transition-colors hover:text-steel">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}