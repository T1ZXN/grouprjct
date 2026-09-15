import { useState } from "react";
import type { FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ContentPage, P, MailLink } from "~/components/ContentPage";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact N2 Wheels | Aftermarket Alloy Wheels UK" },
      {
        name: "description",
        content:
          "Get in touch with N2 Wheels — email enquiry@n2wheels.co.uk with fitment questions, order queries or feedback. We verify wheel compatibility before confirming any order.",
      },
    ],
  }),
  component: ContactPage,
});

const CONTACT_EMAIL = "enquiry@n2wheels.co.uk";

function ContactPage() {
  return (
    <ContentPage
      chip="Contact"
      title="Talk to N2 Wheels"
      intro="Questions about a wheel, a fitment, delivery or an order? We'd love to hear from you — email us any time."
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ContactForm />
        <div className="space-y-6">
          <DetailsCard />
          <QuickLinksCard />
        </div>
      </div>
    </ContentPage>
  );
}

/** Honest contact form: composes a mailto with the message — nothing is sent by the site. */
function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // No email integration exists yet — open the customer's mail client with the
    // message pre-filled. The site NEVER pretends it sent anything.
    const subject = encodeURIComponent(`N2 Wheels enquiry from ${name || "a visitor"}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setSent("Thanks — your message is ready to send. Email us at enquiry@n2wheels.co.uk to finish it off.");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <div className="border-b border-line bg-coal/60 px-5 py-3.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Send us a message</h2>
      </div>
      <div className="p-5 sm:p-6">
        {sent ? (
          <div className="rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
            <p className="font-semibold text-white">{sent}</p>
            <p className="mt-2">
              Your email app should have opened with your message ready — if it didn&apos;t,
              email <MailLink /> directly.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="contact-name" className="field-label">
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input"
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="field-label">
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="field-label">
                Message
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="field-input"
                placeholder="Tell us what you're looking for — car, wheel size, anything."
              />
            </div>
            <button type="submit" className="btn btn-red w-full">
              Prepare Email
            </button>
            <p className="text-xs leading-relaxed text-steel-dim">
              This site has no email integration yet — the button opens your email app with the
              message ready to send to {CONTACT_EMAIL}. Nothing is sent from this website.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function DetailsCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <div className="border-b border-line bg-coal/60 px-5 py-3.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Contact details</h2>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <p className="field-label">Email</p>
          <p className="text-sm">
            <MailLink />
          </p>
        </div>
        <div>
          <p className="field-label">Phone</p>
          <p className="text-sm text-steel-dim">Details coming soon</p>
        </div>
        <div>
          <p className="field-label">Address</p>
          <p className="text-sm text-white">245a Glasgow Road, G73 1SU</p>
        </div>
        <p className="text-xs leading-relaxed text-steel-dim">
          Phone number to be confirmed — email us any time in the meantime.
        </p>
      </div>
    </div>
  );
}

function QuickLinksCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <div className="border-b border-line bg-coal/60 px-5 py-3.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Quick answers</h2>
      </div>
      <div className="p-5 sm:p-6">
        <P>
          Most questions are already answered in our help pages — worth a look before you email:
        </P>
        <ul className="mt-4 space-y-3 text-sm font-medium">
          <li>
            <Link to="/delivery" className="link-muted">
              Delivery &amp; shipping →
            </Link>
          </li>
          <li>
            <Link to="/returns" className="link-muted">
              Returns &amp; refunds →
            </Link>
          </li>
          <li>
            <Link to="/faq" className="link-muted">
              Frequently asked questions →
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}