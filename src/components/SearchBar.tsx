"use client";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { cleanQuery } from "@/lib/query";

/**
 * Explore search: one bar that says what it understood (a person or a project) while you type.
 * Plain GET form underneath, so it works before hydration. "/" focuses it from anywhere on the page.
 */
export function SearchBar({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const q = cleanQuery(value);
  const kind = !q ? null : q.includes("/") ? "project" : "person";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form className="search-bar" action="/" method="get" role="search" data-focused={focused || undefined}>
      <label htmlFor="q" className="sr-only">GitHub handle or project</label>
      <Search className="search-bar-icon" size={18} aria-hidden="true" />
      <input
        ref={input}
        id="q"
        name="q"
        type="search"
        className="search-bar-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === "Escape" && value) { e.preventDefault(); setValue(""); } }}
        placeholder="@handle or owner/repo"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby="q-kind"
      />
      <span id="q-kind" className="search-bar-kind" data-kind={kind ?? undefined} aria-live="polite">
        {kind === "project" ? "Project" : kind === "person" ? "Person" : ""}
      </span>
      {value ? (
        <button type="button" className="search-bar-clear" aria-label="Clear search" onClick={() => { setValue(""); input.current?.focus(); }}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : (
        !focused && <kbd className="search-bar-kbd" aria-hidden="true">/</kbd>
      )}
      {/* Map trust comes first in the DOM so Enter submits it; CSS order puts it on the right. */}
      <div className="search-bar-actions">
        <Button type="submit" className="search-bar-primary">Map trust</Button>
        <Button
          type="submit"
          variant="secondary"
          formAction="/profile"
          disabled={kind === "project"}
          title={kind === "project" ? "Profiles are for people; Map trust shows a project" : undefined}
        >
          Show profile
        </Button>
      </div>
    </form>
  );
}
