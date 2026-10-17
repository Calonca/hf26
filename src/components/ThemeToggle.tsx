"use client";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ThemeSwitch, type Theme } from "@/components/arc/theme-switch/theme-switch";

/**
 * Flips data-theme with every element in step. Per-element color transitions (buttons, pills, cells…) have different
 * durations, so they are switched off for the flip; where the browser supports view transitions the whole page then
 * crossfades as one image, revealed in a circle from the switch.
 */
function applyTheme(next: Theme, trigger: HTMLElement, commit: () => void) {
  const root = document.documentElement;
  const flip = () => {
    root.dataset.theme = next;
    commit();
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("theme-switching");
  // Two frames: one to paint the new colors with transitions off, one before they come back.
  const release = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));

  if (reduced || typeof document.startViewTransition !== "function") {
    flip();
    release();
    return;
  }

  const box = trigger.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(() => flushSync(flip));
  transition.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: "cubic-bezier(.2, 0, 0, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
  transition.finished.finally(release);
}

/** Light/dark switch. The inline script in layout.tsx sets the initial data-theme before paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  return (
    <ThemeSwitch
      theme={theme}
      iconOnly
      onThemeChange={(next, _variant, trigger) => {
        applyTheme(next, trigger, () => setTheme(next));
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
    />
  );
}
