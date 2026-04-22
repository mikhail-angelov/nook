// Wikilink resolution rules (design.md §MVP scope item 2):
// - Match by title (case-insensitive, trimmed). Unique match wins.
// - If the raw reference contains a `/`, treat it as a path match. The raw
//   may be a full path (`notes/sub/foo.md`) or a path+basename without
//   extension (`sub/foo` or `folder/Title`).
// - Any `|display` alias is already stripped by the caller (parseNote does
//   this); we strip defensively here too.
// - Multiple title matches with no path disambiguator => unresolved (null).

export type ResolvableNote = {
  id: string;
  path: string;
  title: string;
};

/**
 * Resolve a `[[wikilink]]` target to a note id (vault-relative path) or null
 * if it cannot be resolved. The `raw` argument is the inner text of the
 * brackets (no `[[`, no `]]`).
 */
export function resolveWikilink(
  raw: string,
  notes: ResolvableNote[],
): string | null {
  if (!raw) return null;
  const aliasStripped = stripAlias(raw).trim();
  if (!aliasStripped) return null;

  if (aliasStripped.includes("/")) {
    return resolveByPath(aliasStripped, notes);
  }

  const titleMatches = findTitleMatches(aliasStripped, notes);
  if (titleMatches.length === 1) return titleMatches[0].id;
  return null;
}

function stripAlias(raw: string): string {
  const pipe = raw.indexOf("|");
  return pipe >= 0 ? raw.slice(0, pipe) : raw;
}

function findTitleMatches(
  needle: string,
  notes: ResolvableNote[],
): ResolvableNote[] {
  const target = needle.toLowerCase();
  return notes.filter((n) => n.title.trim().toLowerCase() === target);
}

function resolveByPath(
  needle: string,
  notes: ResolvableNote[],
): string | null {
  const n = needle.toLowerCase();
  // Direct path / id hit (with or without extension).
  for (const note of notes) {
    const p = note.path.toLowerCase();
    if (p === n) return note.id;
    if (stripExt(p) === n) return note.id;
  }
  // Suffix match: `folder/Title` should match `notes/folder/Title.md`.
  const candidates = notes.filter((note) => {
    const p = note.path.toLowerCase();
    return p.endsWith("/" + n) || stripExt(p).endsWith("/" + n);
  });
  if (candidates.length === 1) return candidates[0].id;
  // Path-segments-match-plus-title: `folder/Title` where last segment matches
  // the title and earlier segments match path directories.
  const segs = needle.split("/");
  const tail = segs[segs.length - 1];
  const dirs = segs.slice(0, -1).join("/").toLowerCase();
  const byTitle = findTitleMatches(tail, notes).filter((note) =>
    note.path.toLowerCase().includes(dirs + "/"),
  );
  if (byTitle.length === 1) return byTitle[0].id;
  return null;
}

function stripExt(p: string): string {
  if (p.endsWith(".md.sec")) return p.slice(0, -".md.sec".length);
  if (p.endsWith(".md")) return p.slice(0, -3);
  if (p.endsWith(".txt")) return p.slice(0, -4);
  return p;
}
