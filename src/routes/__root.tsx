import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BasketProvider } from "~/components/BasketProvider";
import { Footer } from "~/components/Footer";
import { Header } from "~/components/Header";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "N2 Wheels | Alloy Wheels, Tyres & Wheel Packages UK" },
      {
        name: "description",
        content:
          "Premium UK aftermarket alloy wheels, tyres and wheel & tyre packages — find wheels that fit your car.",
      },
      { name: "theme-color", content: "#18181c" },
      {
        property: "og:title",
        content: "N2 Wheels | Alloy Wheels, Tyres & Wheel Packages UK",
      },
      {
        property: "og:description",
        content:
          "Premium UK aftermarket alloy wheels, tyres and wheel & tyre packages — find wheels that fit your car.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/images/hero-n2.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        type: "image/png",
        href: "/images/favicon-64.png",
        sizes: "64x64",
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/images/favicon-192.png",
        sizes: "192x192",
      },
      { rel: "apple-touch-icon", href: "/images/apple-touch-icon-180.png" },
    ],
  }),
  notFoundComponent: () => (
    <div className="container-x py-24 text-center">
      <p className="text-lg font-bold text-white">Page not found</p>
      <p className="mt-2 text-sm text-steel">
        The page you were looking for doesn't exist (yet).
      </p>
    </div>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      {/* Basket state is available to the header badge and every product page. */}
      <BasketProvider>
        <Header />
        <Outlet />
        <Footer />
      </BasketProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
