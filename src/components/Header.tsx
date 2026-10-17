import Link from "next/link";
import NavLinks from "./NavLinks";

/** "gemma4:e4b" → "Gemma 4 E4B · local" */
export function modelLabel(model = process.env.OLLAMA_MODEL ?? "gemma4:e4b") {
  const m = model.match(/^gemma(\d+)(?::(.+))?$/i);
  if (!m) return `${model} · local`;
  return `Gemma ${m[1]}${m[2] ? " " + m[2].toUpperCase() : ""} · local`;
}

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">Vouch Explorer</Link>
        <NavLinks />
        <span className="model-badge" title="Model runs locally via Ollama">{modelLabel()}</span>
      </div>
    </header>
  );
}
