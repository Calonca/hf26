"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" },
  { href: "/discover", label: "Discover", match: (p: string) => p.startsWith("/discover") },
  { href: "/requests", label: "Requests", match: (p: string) => p.startsWith("/requests") },
  { href: "/profile", label: "Profile", match: (p: string) => p.startsWith("/u/") || p.startsWith("/profile") },
];

/** Profile follows context: the profile you're on, the user mapped on Explore, else the lookup page. */
function profileHref(path: string, q: string | null) {
  if (path.startsWith("/u/")) return path;
  const handle = q?.trim().replace(/^@/, "");
  if (path === "/" && handle && !handle.includes("/")) return `/u/${encodeURIComponent(handle)}`;
  return "/profile";
}

export default function NavLinks() {
  const path = usePathname() ?? "/";
  const q = useSearchParams().get("q");
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.label} href={l.label === "Profile" ? profileHref(path, q) : l.href} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
