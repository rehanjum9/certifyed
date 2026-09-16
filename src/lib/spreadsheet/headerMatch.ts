// Auto-matching is a convenience only: it fills in a sensible default when
// exactly one header clearly matches, and leaves the mapping unset (never a
// silent guess) whenever more than one header could plausibly match. The
// user can always override any mapping manually.

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const EMAIL_ALIASES = [
  "email",
  "email address",
  "e-mail",
  "e mail",
  "recipient email",
  "mail",
].map(normalizeHeader);

const KNOWN_FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "participant name", "recipient name", "student name"],
  serial_number: ["serial number", "serial no", "certificate id", "certificate number", "cert no"],
  date: ["date", "issue date", "completion date"],
  course: ["course", "course name", "program"],
  grade: ["grade", "score", "result"],
};

export function candidateAliasesForField(fieldKey: string, label: string): string[] {
  const known = KNOWN_FIELD_ALIASES[fieldKey] ?? [];
  return [normalizeHeader(fieldKey), normalizeHeader(label), ...known.map(normalizeHeader)];
}

/**
 * Returns the column index whose normalized header matches one of the
 * given aliases, but only when exactly one column matches. Returns null
 * for no match AND for an ambiguous (multiple-column) match -- both cases
 * require the user to choose manually.
 */
export function findAutoMatchColumnIndex(headers: string[], aliases: string[]): number | null {
  const aliasSet = new Set(aliases);
  const matches = headers
    .map((header, index) => ({ index, isMatch: aliasSet.has(normalizeHeader(header)) }))
    .filter((entry) => entry.isMatch);

  return matches.length === 1 ? matches[0].index : null;
}

export function autoMatchEmailColumn(headers: string[]): number | null {
  return findAutoMatchColumnIndex(headers, EMAIL_ALIASES);
}

export function autoMatchFieldColumn(headers: string[], fieldKey: string, label: string): number | null {
  return findAutoMatchColumnIndex(headers, candidateAliasesForField(fieldKey, label));
}
