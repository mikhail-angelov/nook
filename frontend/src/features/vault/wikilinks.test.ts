import { describe, expect, it } from "vitest";

import { resolveWikilink, type ResolvableNote } from "./wikilinks";

const mk = (id: string, title: string): ResolvableNote => ({
  id,
  path: id,
  title,
});

describe("resolveWikilink", () => {
  it("resolves a unique title match (case-insensitive)", () => {
    const notes: ResolvableNote[] = [
      mk("notes/alpha.md", "Alpha"),
      mk("notes/beta.md", "Beta"),
    ];
    expect(resolveWikilink("alpha", notes)).toBe("notes/alpha.md");
    expect(resolveWikilink("Beta", notes)).toBe("notes/beta.md");
  });

  it("disambiguates two equally-titled notes via a path prefix", () => {
    const notes: ResolvableNote[] = [
      mk("projects/foo/Notes.md", "Notes"),
      mk("projects/bar/Notes.md", "Notes"),
    ];
    // Plain title is ambiguous → null
    expect(resolveWikilink("Notes", notes)).toBeNull();
    // Path-qualified → unique
    expect(resolveWikilink("projects/foo/Notes", notes)).toBe(
      "projects/foo/Notes.md",
    );
    expect(resolveWikilink("bar/Notes", notes)).toBe("projects/bar/Notes.md");
  });

  it("strips the alias suffix before resolving", () => {
    const notes: ResolvableNote[] = [mk("notes/title.md", "Title")];
    expect(resolveWikilink("Title|Display Text", notes)).toBe("notes/title.md");
  });

  it("returns null when no note matches", () => {
    const notes: ResolvableNote[] = [mk("notes/a.md", "A")];
    expect(resolveWikilink("NotHere", notes)).toBeNull();
    expect(resolveWikilink("", notes)).toBeNull();
  });
});
