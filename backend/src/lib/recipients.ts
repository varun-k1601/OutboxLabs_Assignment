import { z } from 'zod';

const emailSchema = z.email();

export interface NormalizedRecipients {
  valid: string[];
  duplicates: number;
  invalid: string[];
}

// trim, lowercase and dedupe (first one wins, order kept)
export function normalizeRecipients(input: readonly string[]): NormalizedRecipients {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const raw of input) {
    const address = raw.trim().toLowerCase();
    if (!address) continue;
    if (!emailSchema.safeParse(address).success) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(address)) {
      duplicates++;
      continue;
    }
    seen.add(address);
    valid.push(address);
  }
  return { valid, duplicates, invalid };
}

// plain text version of the body, for the text/plain part and for search
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
