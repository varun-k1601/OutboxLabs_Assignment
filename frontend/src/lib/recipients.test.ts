import { describe, expect, it } from 'vitest';
import { extractEmails, isValidEmail, mergeEmails } from './recipients';

describe('extractEmails', () => {
  it('reads addresses from a CSV with a header row and extra columns', () => {
    const csv = 'name,email,company\nJane Doe,Jane.Doe@Acme.io,Acme\n"Smith, John",john@globex.com,Globex\n';
    expect(extractEmails(csv)).toEqual({ emails: ['jane.doe@acme.io', 'john@globex.com'], duplicates: 0 });
  });

  it('handles newline / comma / semicolon separated lists and counts duplicates', () => {
    const text = 'a@x.com\nb@y.org; A@X.com , c@z.co.uk';
    expect(extractEmails(text)).toEqual({ emails: ['a@x.com', 'b@y.org', 'c@z.co.uk'], duplicates: 1 });
  });

  it('returns nothing for text without addresses', () => {
    expect(extractEmails('email\nnot-an-email\n@broken')).toEqual({ emails: [], duplicates: 0 });
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects malformed ones', () => {
    expect(isValidEmail('first.last+tag@sub.example.com')).toBe(true);
    expect(isValidEmail('no-at-sign.com')).toBe(false);
    expect(isValidEmail('two@@example.com')).toBe(false);
  });
});

describe('mergeEmails', () => {
  it('appends only new addresses and reports how many were added', () => {
    expect(mergeEmails(['a@x.com'], ['a@x.com', 'b@x.com'])).toEqual({ merged: ['a@x.com', 'b@x.com'], added: 1 });
  });
});
