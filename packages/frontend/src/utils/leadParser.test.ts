import { describe, it, expect } from 'vitest';
import { parseLeads } from './leadParser';

describe('parseLeads', () => {
  it('extracts valid emails separated by commas', () => {
    const result = parseLeads('alice@example.com, bob@test.org, carol@mail.co');
    expect(result.validEmails).toHaveLength(3);
    expect(result.validEmails).toContain('alice@example.com');
    expect(result.validEmails).toContain('bob@test.org');
    expect(result.validEmails).toContain('carol@mail.co');
    expect(result.invalidCount).toBe(0);
  });

  it('extracts valid emails separated by newlines', () => {
    const result = parseLeads('a@b.com\nc@d.com\ne@f.org');
    expect(result.validEmails).toHaveLength(3);
    expect(result.invalidCount).toBe(0);
  });

  it('extracts valid emails separated by semicolons', () => {
    const result = parseLeads('a@b.com;c@d.com;e@f.org');
    expect(result.validEmails).toHaveLength(3);
    expect(result.invalidCount).toBe(0);
  });

  it('handles mixed separators', () => {
    const result = parseLeads('a@b.com, c@d.com\ne@f.org; g@h.io');
    expect(result.validEmails).toHaveLength(4);
    expect(result.invalidCount).toBe(0);
  });

  it('counts invalid email entries', () => {
    const result = parseLeads('valid@email.com, notanemail, @missing.com');
    expect(result.validEmails).toHaveLength(1);
    expect(result.validEmails).toContain('valid@email.com');
    expect(result.invalidCount).toBe(2);
  });

  it('deduplicates valid emails (case-insensitive)', () => {
    const result = parseLeads('Test@Email.com, test@email.com, TEST@EMAIL.COM');
    expect(result.validEmails).toHaveLength(1);
    expect(result.validEmails).toContain('test@email.com');
    expect(result.invalidCount).toBe(0);
  });

  it('does not count empty/whitespace-only tokens as invalid', () => {
    const result = parseLeads('a@b.com,,  , \n, c@d.com');
    expect(result.validEmails).toHaveLength(2);
    expect(result.invalidCount).toBe(0);
  });

  it('handles empty string input', () => {
    const result = parseLeads('');
    expect(result.validEmails).toHaveLength(0);
    expect(result.invalidCount).toBe(0);
  });

  it('handles whitespace-only input', () => {
    const result = parseLeads('   \n  \t  ');
    expect(result.validEmails).toHaveLength(0);
    expect(result.invalidCount).toBe(0);
  });

  it('trims whitespace around emails', () => {
    const result = parseLeads('  hello@world.com  ,  foo@bar.org  ');
    expect(result.validEmails).toContain('hello@world.com');
    expect(result.validEmails).toContain('foo@bar.org');
    expect(result.invalidCount).toBe(0);
  });

  it('rejects emails with spaces', () => {
    const result = parseLeads('hello @world.com');
    expect(result.validEmails).toHaveLength(0);
    expect(result.invalidCount).toBe(1);
  });

  it('handles Windows-style line endings', () => {
    const result = parseLeads('a@b.com\r\nc@d.com\r\ne@f.org');
    expect(result.validEmails).toHaveLength(3);
    expect(result.invalidCount).toBe(0);
  });
});
