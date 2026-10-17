import { describe, expect, it } from "vitest";
import { parseVouchFile } from "../src/server/vouchParser";

// Verbatim tail of mitchellh/vouch VOUCHED.example.td
const EXAMPLE = `# The list of vouched (or actively denounced) users for this repository.
#
# Syntax:
#  - One handle per line (without @). Sorted alphabetically.
#  - Optionally specify platform: \`platform:username\` (e.g., \`github:mitchellh\`).
#  - To denounce a user, prefix with minus: \`-username\` or \`-platform:username\`.
#  - Optionally, add details after a space following the handle.
mitchellh
-github:badguy
-github:slopmaster3000 Submitted endless amounts of AI slop
`;

describe("parseVouchFile", () => {
  it("parses the official example", () => {
    expect(parseVouchFile(EXAMPLE)).toEqual([
      { platform: "github", login: "mitchellh", status: "vouched", note: null, line: 8 },
      { platform: "github", login: "badguy", status: "denounced", note: null, line: 9 },
      { platform: "github", login: "slopmaster3000", status: "denounced", note: "Submitted endless amounts of AI slop", line: 10 },
    ]);
  });

  it("handles platform prefixes, notes, blank lines and CRLF", () => {
    const r = parseVouchFile("\r\ngitlab:alice  great reviewer\r\n\r\ngithub:Bob\r\n");
    expect(r.map((e) => [e.platform, e.login, e.status, e.note])).toEqual([
      ["gitlab", "alice", "vouched", "great reviewer"],
      ["github", "Bob", "vouched", null],
    ]);
  });

  it("ignores comments, tolerates @ and skips invalid handles and duplicates", () => {
    const r = parseVouchFile("# c\n  # indented comment\n@carol\nnot/valid\ncarol\n-\n");
    expect(r.map((e) => e.login)).toEqual(["carol"]);
  });

  it("accepts `+ handle` and `- handle` with a space (atuinsh/atuin style)", () => {
    const r = parseVouchFile("+ 0x4A6F\n- spammer bad PRs\n");
    expect(r.map((e) => [e.login, e.status, e.note])).toEqual([
      ["0x4A6F", "vouched", null],
      ["spammer", "denounced", "bad PRs"],
    ]);
  });
});
