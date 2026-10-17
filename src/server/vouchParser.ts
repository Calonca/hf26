// Parses Vouch's VOUCHED.td format (see mitchellh/vouch VOUCHED.example.td):
//   - `#` starts a comment line; blank lines are ignored
//   - one handle per line, optionally `platform:handle` (default platform: github)
//   - `-handle` / `-platform:handle` denounces
//   - anything after the first whitespace is a free-text note
//   - seen in the wild (atuinsh/atuin): `+ handle` / `- handle` with a space after the sign
export type VouchEntry = {
  platform: string;
  login: string;
  status: "vouched" | "denounced";
  note: string | null;
  line: number;
};

const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/;

export function parseVouchFile(text: string): VouchEntry[] {
  const out: VouchEntry[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const signed = line.match(/^([+-])\s+(.*)$/);
    const body = signed ? (signed[1] === "-" ? "-" : "") + signed[2] : line;
    const m = body.match(/^(\S+)(?:\s+(.*))?$/);
    if (!m) return;
    let token = m[1];
    const note = m[2]?.trim() || null;
    let status: VouchEntry["status"] = "vouched";
    if (token.startsWith("-")) {
      status = "denounced";
      token = token.slice(1);
    }
    let platform = "github";
    const colon = token.indexOf(":");
    if (colon > 0) {
      platform = token.slice(0, colon).toLowerCase();
      token = token.slice(colon + 1);
    }
    token = token.replace(/^@/, "");
    if (!HANDLE.test(token)) return;
    const key = `${platform}:${token.toLowerCase()}`;
    if (seen.has(key)) return; // first occurrence wins
    seen.add(key);
    out.push({ platform, login: token, status, note, line: i + 1 });
  });
  return out;
}

/** Lines of a vouch file as `platform:login:status` keys, for diffing git revisions. */
export function entryKeys(text: string): Map<string, VouchEntry> {
  return new Map(parseVouchFile(text).map((e) => [`${e.platform}:${e.login.toLowerCase()}`, e]));
}
