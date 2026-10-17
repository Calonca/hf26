import { Suspense } from "react";
import Link from "next/link";
import AiQueue from "./AiQueue";
import NavLinks from "./NavLinks";

/** "gemma4:e4b" → "Gemma 4 E4B · local" */
export function modelLabel(model = process.env.OLLAMA_MODEL ?? "gemma4:e4b") {
  const m = model.match(/^gemma(\d+)(?::([^-]+))?/i);
  if (!m) return `${model} · local`;
  return `Gemma ${m[1]}${m[2] ? " " + m[2].toUpperCase() : ""} · local`;
}

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2" aria-hidden="true">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="12" cy="18" r="3" />
            <path d="M8 8l3 7M16 8l-3 7M9 6h6" />
          </svg>
          <span>Vouch Explorer</span>
        </Link>
        <Suspense fallback={null}>
          <NavLinks />
        </Suspense>
        <AiQueue />
        <span className="model-badge" title="Open-weight model, runs locally">{modelLabel()}</span>
      </div>
    </header>
  );
}
