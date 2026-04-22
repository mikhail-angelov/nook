export type ParsedSearchQuery = {
  tags: string[];
  paths: string[];
  phrases: string[];
  terms: string[];
};

const PHRASE_RE = /"([^"]+)"/g;
const TOKEN_RE = /\S+/g;

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const tags: string[] = [];
  const paths: string[] = [];
  const phrases: string[] = [];

  const stripped = input.replace(PHRASE_RE, (_match, phrase: string) => {
    const normalized = phrase.trim();
    if (normalized) {
      phrases.push(normalized.toLowerCase());
    }
    return " ";
  });

  const terms: string[] = [];
  for (const token of stripped.match(TOKEN_RE) ?? []) {
    const normalized = token.trim();
    if (!normalized) continue;
    const lower = normalized.toLowerCase();
    if (lower.startsWith("tag:") && lower.length > 4) {
      tags.push(lower.slice(4));
      continue;
    }
    if (lower.startsWith("path:") && lower.length > 5) {
      paths.push(lower.slice(5));
      continue;
    }
    terms.push(lower);
  }

  return { tags, paths, phrases, terms };
}
