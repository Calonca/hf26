"use client";
import { useEffect, useState } from "react";
import { ThemeSwitch, type Theme } from "@/components/arc/theme-switch/theme-switch";

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
      onThemeChange={(next) => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
        setTheme(next);
      }}
    />
  );
}
