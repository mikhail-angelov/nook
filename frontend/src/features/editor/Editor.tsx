// CodeMirror 6 editor, mounted manually (no React wrapper). We own the
// EditorView instance and replace its document when the caller selects a
// different note. The component is controlled-ish: the parent owns the
// buffer in `useNoteBuffer` and feeds it back via the `note.body` prop; we
// only mirror it when the note id changes, not on every draft change (that
// would create a feedback loop with the onChange callback).

import { useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { wikilinkDecorationPlugin } from "./wikilinks";
import type { Note } from "@/features/vault/notes";

export type EditorProps = {
  note: Note | null;
  /** Current buffer (uncontrolled from CM's POV, set once per note switch). */
  value: string;
  onChange: (body: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  /** Banner shown above the editor when external changes hit a dirty buffer. */
  conflict?: boolean;
  onReload?: () => void;
  /** Fired on Cmd/Ctrl+Shift+F with any currently selected text. */
  onGlobalSearch?: (selection: string) => void;
};

export function shouldSyncEditorDocument(opts: {
  currentNoteId: string | null;
  lastNoteId: string | null;
  currentDoc: string;
  nextValue: string;
}): boolean {
  return (
    opts.currentNoteId !== opts.lastNoteId || opts.currentDoc !== opts.nextValue
  );
}

// Obsidian-ish in-place rendering: headings get larger font and weight, bold
// and italic render as such, inline code becomes monospaced, and the leading
// markers (# ** * `) are dimmed so the source stays visible but reads like
// formatted prose. CM keeps the raw text — no separate preview pane.
const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.8em", fontWeight: "700", lineHeight: "1.25" },
  { tag: t.heading2, fontSize: "1.5em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading3, fontSize: "1.3em", fontWeight: "600", lineHeight: "1.35" },
  { tag: t.heading4, fontSize: "1.15em", fontWeight: "600" },
  { tag: t.heading5, fontSize: "1.05em", fontWeight: "600" },
  { tag: t.heading6, fontSize: "1em", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#60a5fa", textDecoration: "underline" },
  { tag: t.url, color: "#60a5fa" },
  {
    tag: t.monospace,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "#f0abfc",
    background: "rgba(148, 163, 184, 0.12)",
  },
  { tag: t.quote, color: "#9ca3af", fontStyle: "italic" },
  // Leading markers: #, **, *, `, >, etc.
  { tag: t.processingInstruction, color: "rgba(148, 163, 184, 0.55)" },
  { tag: t.meta, color: "rgba(148, 163, 184, 0.55)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "1rem",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    lineHeight: "1.6",
    padding: "1rem 1.25rem",
  },
  ".cm-content": {
    maxWidth: "56rem",
    margin: "0 auto",
    caretColor: "black",
  },
  ".cm-line": {
    padding: "0 0",
  },
});

function makeExtensions(
  onChange: (body: string) => void,
  onBlur: (() => void) | undefined,
  onGlobalSearch: ((selection: string) => void) | undefined,
  readOnly: boolean,
) {
  return [
    history(),
    keymap.of([
      {
        key: "Mod-Shift-f",
        preventDefault: true,
        run: (view) => {
          const { from, to } = view.state.selection.main;
          const selection = view.state.sliceDoc(from, to);
          onGlobalSearch?.(selection);
          return true;
        },
      },
      ...searchKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    search({ top: true }),
    markdown(),
    syntaxHighlighting(markdownHighlightStyle),
    EditorView.lineWrapping,
    EditorView.editable.of(!readOnly),
    EditorState.readOnly.of(readOnly),
    editorTheme,
    wikilinkDecorationPlugin(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      blur() {
        onBlur?.();
        return false;
      },
    }),
  ];
}

export function Editor(props: EditorProps) {
  const {
    note,
    value,
    onChange,
    onBlur,
    readOnly,
    conflict,
    onReload,
    onGlobalSearch,
  } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const onGlobalSearchRef = useRef(onGlobalSearch);
  onGlobalSearchRef.current = onGlobalSearch;
  const lastNoteIdRef = useRef<string | null>(null);

  // Mount / tear down the view.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: makeExtensions(
          (body) => onChangeRef.current(body),
          () => onBlurRef.current?.(),
          (selection) => onGlobalSearchRef.current?.(selection),
          !!readOnly,
        ),
      }),
    });
    viewRef.current = view;
    lastNoteIdRef.current = note?.id ?? null;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally mount only once; the extensions above are stable
    // (they read from refs). Note switching is handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document when the selected note changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentId = note?.id ?? null;
    if (
      !shouldSyncEditorDocument({
        currentNoteId: currentId,
        lastNoteId: lastNoteIdRef.current,
        currentDoc: view.state.doc.toString(),
        nextValue: value,
      })
    ) {
      return;
    }
    lastNoteIdRef.current = currentId;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [note?.id, value]);

  // Reconfigure read-only when it toggles.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.setState(
      EditorState.create({
        doc: view.state.doc.toString(),
        extensions: makeExtensions(
          (body) => onChangeRef.current(body),
          () => onBlurRef.current?.(),
          (selection) => onGlobalSearchRef.current?.(selection),
          !!readOnly,
        ),
      }),
    );
  }, [readOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {conflict ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span>File changed on disk.</span>
          <button
            type="button"
            onClick={onReload}
            className="rounded border border-amber-500/60 px-2 py-1 text-xs hover:bg-amber-500/20"
          >
            Reload
          </button>
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-auto"
        data-testid="cm-host"
      />
    </div>
  );
}
