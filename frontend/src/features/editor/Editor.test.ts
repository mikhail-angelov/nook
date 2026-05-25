import { describe, expect, it } from "vitest";

import { shouldSyncEditorDocument } from "./Editor";

describe("shouldSyncEditorDocument", () => {
  it("syncs when the same note reloads with new content", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/a.md",
        lastNoteId: "notes/a.md",
        currentDoc: "old body",
        nextValue: "new body",
      }),
    ).toBe(true);
  });

  it("does not sync when nothing changed", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/a.md",
        lastNoteId: "notes/a.md",
        currentDoc: "body",
        nextValue: "body",
      }),
    ).toBe(false);
  });

  it("syncs when the selected note changes", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/b.md",
        lastNoteId: "notes/a.md",
        currentDoc: "old body",
        nextValue: "new body",
      }),
    ).toBe(true);
  });
});

// ── GFM parser integration tests ────────────────────────────────────────────
// Verify that the markdown language extension with GFM recognises tables,
// task lists, and strikethrough. We test through the lezer-markdown parser
// rather than a full CodeMirror state to keep tests fast.

import { GFM } from "@lezer/markdown";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

function nodeNames(doc: string): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM], base: markdownLanguage })],
  });
  const cursor = syntaxTree(state).cursor();
  const names: string[] = [];
  // Iterate all nodes in the tree (breadth-first with depth tracking)
  let depth = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    names.push(cursor.name);
    if (cursor.firstChild()) {
      depth++;
      continue;
    }
    // No children — try next sibling or walk up
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (cursor.nextSibling()) break; // found a sibling
      if (depth === 0) return names; // back at root — done
      cursor.parent();
      depth--;
    }
  }
}

describe("GFM: tables", () => {
  const table = [
    "| A | B |",
    "|---|---|",
    "| 1 | 2 |",
  ].join("\n");

  it("parses Table nodes", () => {
    const names = nodeNames(table);
    expect(names).toContain("Table");
  });
});

describe("GFM: task lists", () => {
  const taskList = [
    "- [ ] unchecked",
    "- [x] checked",
    "* [ ] another",
  ].join("\n");

  it("parses Task nodes inside list items", () => {
    const names = nodeNames(taskList);
    // GFM parsing produces Task nodes for each checkbox
    const taskCount = names.filter((n) => n === "Task").length;
    expect(taskCount).toBeGreaterThanOrEqual(3);
  });
});

describe("GFM: strikethrough", () => {
  const text = "hello ~~world~~ foo";

  it("parses Strikethrough nodes", () => {
    const names = nodeNames(text);
    expect(names).toContain("Strikethrough");
  });
});

// ── Image markdown insertion ────────────────────────────────────────────────

describe("image markdown", () => {
  it("generates correct markdown syntax", () => {
    const filename = "photo.png";
    const alt = filename.replace(/\.[^.]+$/, "");
    const relPath = "assets/2026-05-25_18-00-00.png";
    const md = `![${alt}](${relPath})`;
    expect(md).toBe("![photo](assets/2026-05-25_18-00-00.png)");
  });

  it("handles filenames with spaces", () => {
    const filename = "my image.jpg";
    const alt = filename.replace(/\.[^.]+$/, "");
    const relPath = "assets/2026-05-25_18-00-00.jpg";
    const md = `![${alt}](${relPath})`;
    expect(md).toBe("![my image](assets/2026-05-25_18-00-00.jpg)");
  });
});

// ── Checkbox toggle regex ───────────────────────────────────────────────────

describe("checkbox toggle pattern detection", () => {
  const uncheckedPattern = /^(\s*[-*+] )\[ \]/;
  const checkedPattern = /^(\s*[-*+] )\[x\]/i;

  it("matches unchecked checkbox", () => {
    expect("- [ ] todo".match(uncheckedPattern)?.[1]).toBe("- ");
  });

  it("matches checked checkbox", () => {
    expect("- [x] done".match(checkedPattern)?.[1]).toBe("- ");
  });

  it("matches with spaces", () => {
    expect("  * [ ] nested".match(uncheckedPattern)?.[1]).toBe("  * ");
  });

  it("does not match regular text", () => {
    expect("hello [ ] world".match(uncheckedPattern)).toBeNull();
  });

  it("flips unchecked to checked and back", () => {
    const line = "- [ ] task";
    const toChecked = line.replace(/\[ \]/g, "[x]");
    const toUnchecked = toChecked.replace(/\[x\]/gi, "[ ]");
    expect(toChecked).toBe("- [x] task");
    expect(toUnchecked).toBe("- [ ] task");
  });
});
