const EMAIL_IN_TEXT = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const SINGLE_EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export interface ExtractedEmails {
  emails: string[];
  duplicates: number;
}

// Grabs every email address out of the text. Works for a CSV with any columns (the header row
// has no address so it gets skipped), one per line, comma separated, or just pasted text.
// Lower-cased and de-duplicated, first occurrence wins.
export function extractEmails(text: string): ExtractedEmails {
  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicates = 0;
  for (const match of text.match(EMAIL_IN_TEXT) ?? []) {
    const email = match.toLowerCase();
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    emails.push(email);
  }
  return { emails, duplicates };
}

export const isValidEmail = (value: string) => SINGLE_EMAIL.test(value.trim());

// add new addresses, skipping ones already in the list
export function mergeEmails(existing: readonly string[], incoming: readonly string[]): { merged: string[]; added: number } {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const email of incoming) {
    if (seen.has(email)) continue;
    seen.add(email);
    merged.push(email);
  }
  return { merged, added: merged.length - existing.length };
}
