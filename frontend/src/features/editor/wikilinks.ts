import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type EditorView, ViewPlugin } from "@codemirror/view";

export type WikilinkRange = {
  from: number;
  to: number;
  raw: string;
  target: string;
};

export function collectWikilinkRanges(text: string): WikilinkRange[] {
  const ranges: WikilinkRange[] = [];
  let index = 0;

  while (index + 1 < text.length) {
    if (text[index] !== "[" || text[index + 1] !== "[") {
      index += 1;
      continue;
    }

    const close = text.indexOf("]]", index + 2);
    if (close < 0) break;

    const raw = text.slice(index + 2, close);
    if (raw.includes("[[") || raw.includes("]]")) {
      index = close + 2;
      continue;
    }
    const target = stripAlias(raw).trim();
    if (target) {
      ranges.push({
        from: index,
        to: close + 2,
        raw,
        target,
      });
    }

    index = close + 2;
  }

  return ranges;
}

export function wikilinkDecorationPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: { view: EditorView; docChanged: boolean }) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
}

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of collectWikilinkRanges(view.state.doc.toString())) {
    builder.add(
      range.from,
      range.to,
      Decoration.mark({
        attributes: {
          class: "cm-wikilink",
          style:
            "text-decoration: underline; text-decoration-color: rgba(34, 197, 94, 0.85); text-decoration-thickness: 2px; text-underline-offset: 2px;",
        },
      }),
    );
  }
  return builder.finish();
}

function stripAlias(raw: string): string {
  const pipe = raw.indexOf("|");
  return pipe >= 0 ? raw.slice(0, pipe) : raw;
}
