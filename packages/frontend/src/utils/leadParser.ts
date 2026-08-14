/**
 * Parses a string of leads (from CSV or text file) and extracts valid email addresses.
 * Splits on commas, newlines, and semicolons. Trims tokens, validates format,
 * deduplicates valid emails, and counts invalid entries.
 */
export function parseLeads(fileContent: string): {
  validEmails: string[];
  invalidCount: number;
} {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Split on comma, newline (various forms), and semicolon
  const tokens = fileContent.split(/[,;\r\n]+/);

  const validSet = new Set<string>();
  let invalidCount = 0;

  for (const raw of tokens) {
    const token = raw.trim();

    // Skip empty/whitespace-only tokens — don't count as invalid
    if (token === '') continue;

    if (EMAIL_REGEX.test(token)) {
      validSet.add(token.toLowerCase());
    } else {
      invalidCount++;
    }
  }

  return {
    validEmails: Array.from(validSet),
    invalidCount,
  };
}
