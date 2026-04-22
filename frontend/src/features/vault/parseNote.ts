// The rules must stay in lockstep with parse_note() on the Rust side — that
// runs on initial scan and first-time ingest; this runs on every save.

export type ParsedNote = {
  title: string;
  body: string;
  tags: string[];
  wikilinks: string[];
};

/**
 * Parse a markdown / plaintext note.
 * - Title: frontmatter `title:` > first `# heading` > filename stem.
 * - Tags: frontmatter `tags:` (flow array or block list) + inline `#tags`, deduped.
 * - Wikilinks: `[[Target]]` or `[[Target|Display]]` (display suffix stripped).
 *
 * `relPath` is the vault-relative path; it is used only for the filename-stem
 * title fallback.
 */
export function parseNote(raw: string, relPath: string): ParsedNote {
  const { title: fmTitle, tags: fmTags, body } = splitFrontmatter(raw);

  const title =
    fmTitle ?? firstH1(body) ?? filenameStem(relPath) ?? "Untitled";

  const inlineTags = extractInlineTags(body);
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const t of [...fmTags, ...inlineTags]) {
    const v = t.trim();
    if (!v) continue;
    if (!seen.has(v)) {
      seen.add(v);
      tags.push(v);
    }
  }

  const wikilinks = extractWikilinks(body);

  return { title, body, tags, wikilinks };
}

function splitFrontmatter(raw: string): {
  title: string | null;
  tags: string[];
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { title: null, tags: [], body: raw };
  }
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { title: null, tags: [], body: raw };
  }
  const rest = normalized.slice(4);
  const end = rest.indexOf("\n---");
  if (end < 0) {
    return { title: null, tags: [], body: raw };
  }
  const yaml = rest.slice(0, end);
  const afterClose = rest.slice(end + 4);
  const body = afterClose.startsWith("\n") ? afterClose.slice(1) : afterClose;
  const { title, tags } = parseFrontmatterYaml(yaml);
  return { title, tags, body };
}

function parseFrontmatterYaml(yaml: string): {
  title: string | null;
  tags: string[];
} {
  let title: string | null = null;
  const tags: string[] = [];
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.replace(/^\s+/, "");
    if (trimmed.startsWith("title:")) {
      const v = stripYamlValue(trimmed.slice("title:".length).trim());
      if (v) title = v;
      i++;
    } else if (trimmed.startsWith("tags:")) {
      const rest = trimmed.slice("tags:".length).trim();
      if (rest === "") {
        // block list
        let j = i + 1;
        while (j < lines.length) {
          const item = lines[j].replace(/^\s+/, "");
          if (item.startsWith("- ")) {
            const v = stripYamlValue(item.slice(2).trim());
            if (v) tags.push(v);
            j++;
          } else if (item === "") {
            j++;
          } else {
            break;
          }
        }
        i = j;
      } else if (rest.startsWith("[")) {
        // flow array
        const endIdx = rest.lastIndexOf("]");
        if (endIdx > 0) {
          const inner = rest.slice(1, endIdx);
          for (const part of inner.split(",")) {
            const v = stripYamlValue(part.trim());
            if (v) tags.push(v);
          }
        }
        i++;
      } else {
        const v = stripYamlValue(rest);
        if (v) tags.push(v);
        i++;
      }
    } else {
      i++;
    }
  }
  return { title, tags };
}

function stripYamlValue(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2) {
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1);
    }
  }
  return t;
}

function firstH1(body: string): string | null {
  for (const line of body.split("\n")) {
    const t = line.replace(/^\s+/, "");
    if (t.startsWith("# ")) {
      const s = t.slice(2).trim();
      if (s) return s;
    }
  }
  return null;
}

function filenameStem(relPath: string): string | null {
  const name = relPath.split("/").pop();
  if (!name) return null;
  if (name.endsWith(".md.sec")) return name.slice(0, -".md.sec".length);
  if (name.endsWith(".md")) return name.slice(0, -3);
  if (name.endsWith(".txt")) return name.slice(0, -4);
  return name;
}

function extractInlineTags(body: string): string[] {
  const out: string[] = [];
  const tagChar = (ch: string) =>
    /[A-Za-z0-9_\-/]/.test(ch);
  const boundary = (ch: string | undefined) =>
    ch === undefined ||
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "(" ||
    ch === "[" ||
    ch === "{" ||
    ch === ",";

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "#") continue;
    if (!boundary(i === 0 ? undefined : body[i - 1])) continue;
    let j = i + 1;
    while (j < body.length && tagChar(body[j])) j++;
    if (j > i + 1) {
      const slice = body.slice(i + 1, j);
      if (/[A-Za-z]/.test(slice)) out.push(slice);
      i = j - 1;
    }
  }
  return out;
}

function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 1 < body.length) {
    if (body[i] === "[" && body[i + 1] === "[") {
      const close = body.indexOf("]]", i + 2);
      if (close < 0) break;
      const inner = body.slice(i + 2, close);
      const pipe = inner.indexOf("|");
      const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
      if (target) out.push(target);
      i = close + 2;
      continue;
    }
    i++;
  }
  return out;
}
