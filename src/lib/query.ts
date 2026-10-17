/** "@ deste04 " → "deste04", " Calonca / hf26" → "Calonca/hf26". Handles and repo names never contain whitespace. */
export const cleanQuery = (raw: string) => raw.replace(/\s+/g, "").replace(/^@+/, "");

/** GitHub logins: letters, digits and single hyphens, at most 39 characters. Anything else would be rejected (422). */
export const isGithubLogin = (login: string) => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login);
