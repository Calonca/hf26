"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Demo on our own accounts (design ground rule).
const DEMO_USER = process.env.NEXT_PUBLIC_DEMO_USER ?? "Calonca";

const LINKS = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" },
  { href: "/discover", label: "Discover", match: (p: string) => p.startsWith("/discover") },
  { href: "/requests", label: "Requests", match: (p: string) => p.startsWith("/requests") },
  { href: `/u/${DEMO_USER}`, label: "Profile", match: (p: string) => p.startsWith("/u/") },
];

export default function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
