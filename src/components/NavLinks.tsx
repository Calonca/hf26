"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" },
  { href: "/discover", label: "Discover", match: (p: string) => p.startsWith("/discover") },
  { href: "/requests", label: "Requests", match: (p: string) => p.startsWith("/requests") },
];

export default function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.label} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
