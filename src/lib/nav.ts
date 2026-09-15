/** Shared site navigation config used by the header and footer. */

export interface NavLinkItem {
  label: string;
  to: string;
}

export const NAV_LINKS: NavLinkItem[] = [
  { label: "Home", to: "/" },
  { label: "Wheels", to: "/wheels" },
  { label: "Tyres", to: "/tyres" },
  { label: "Wheel & Tyre Packages", to: "/packages" },
  { label: "Accessories", to: "/accessories" },
  { label: "Fitment Guide", to: "/fitment-guide" },
  { label: "About Us", to: "/about" },
  { label: "Contact", to: "/contact" },
];

export interface FooterColumn {
  title: string;
  links: NavLinkItem[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Shop",
    links: [
      { label: "Wheels", to: "/wheels" },
      { label: "Tyres", to: "/tyres" },
      { label: "Wheel & Tyre Packages", to: "/packages" },
      { label: "Accessories", to: "/accessories" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Find Wheels For My Car", to: "/fitment" },
      { label: "Delivery", to: "/delivery" },
      { label: "Returns", to: "/returns" },
      { label: "FAQ", to: "/faq" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "News", to: "/news" },
    ],
  },
];

export interface SocialLink {
  label: string;
  href: string;
  icon: "facebook" | "instagram" | "x" | "youtube";
}

export const SOCIALS: SocialLink[] = [
  { label: "N2 Wheels on Facebook", href: "#", icon: "facebook" },
  { label: "N2 Wheels on Instagram", href: "#", icon: "instagram" },
  { label: "N2 Wheels on X", href: "#", icon: "x" },
  { label: "N2 Wheels on YouTube", href: "#", icon: "youtube" },
];

export const CONTACT_EMAIL = "enquiry@n2wheels.co.uk";