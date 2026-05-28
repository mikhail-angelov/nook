import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { Note } from "@/features/vault/notes";

type NoteToolbarProps = {
  editorViewRef: { current: EditorView | null };
  activeNote: Note | null;
  onRename: () => void;
  onDelete: () => void;
  onMakeSecure: () => void;
};

function getMatchStats(
  view: EditorView,
  searchText: string,
): { current: number; total: number } {
  if (!searchText) return { current: 0, total: 0 };
  try {
    const query = new SearchQuery({ search: searchText });
    if (!query.valid) return { current: 0, total: 0 };
    // getCursor uses the same matching logic (case-insensitive by default)
    const iter = query.getCursor(view.state.doc);
    const matches: { from: number; to: number }[] = [];
    let res: IteratorResult<{ from: number; to: number }>;
    while (!(res = iter.next()).done) {
      matches.push(res.value);
    }
    const total = matches.length;
    if (total === 0) return { current: 0, total: 0 };
    const { from, to } = view.state.selection.main;
    const idx = matches.findIndex((m) => m.from === from && m.to === to);
    return { current: idx >= 0 ? idx + 1 : 0, total };
  } catch {
    return { current: 0, total: 0 };
  }
}

export function NoteToolbar({
  editorViewRef,
  activeNote,
  onRename,
  onDelete,
  onMakeSecure,
}: NoteToolbarProps) {
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [matchStats, setMatchStats] = useState({ current: 0, total: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Reset search state when the active note changes.
  useEffect(() => {
    setSearchText("");
    setMatchStats({ current: 0, total: 0 });
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
    }
  }, [activeNote?.id, editorViewRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "f") {
        e.preventDefault();
        findInputRef.current?.focus();
        findInputRef.current?.select();
      } else if (e.key === "r") {
        e.preventDefault();
        setShowReplace(true);
        // focus runs after state update so the input is mounted
        setTimeout(() => findInputRef.current?.focus(), 0);
      }
    };
    // capture=true intercepts before CodeMirror's keymap handles Mod-f
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  const dispatchQuery = useCallback(
    (search: string, replace: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, replace })) });
    },
    [editorViewRef],
  );

  // Commit the current search text to the editor (called on Enter).
  const commitSearch = useCallback(
    (forward = true) => {
      const view = editorViewRef.current;
      if (!view) return;
      // openSearchPanel activates the highlight machinery (idempotent once panel is open).
      openSearchPanel(view);
      dispatchQuery(searchText, replaceText);
      if (searchText) {
        forward ? findNext(view) : findPrevious(view);
        setMatchStats(getMatchStats(view, searchText));
      } else {
        setMatchStats({ current: 0, total: 0 });
      }
    },
    [editorViewRef, searchText, replaceText, dispatchQuery],
  );

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    // Clear highlights immediately when the input is emptied.
    if (!text) {
      dispatchQuery("", replaceText);
      setMatchStats({ current: 0, total: 0 });
    }
  }, [dispatchQuery, replaceText]);

  const handleReplaceChange = useCallback((text: string) => {
    setReplaceText(text);
  }, []);

  const handleFindNext = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !searchText) return;
    findNext(view);
    setMatchStats(getMatchStats(view, searchText));
  }, [editorViewRef, searchText]);

  const handleFindPrevious = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !searchText) return;
    findPrevious(view);
    setMatchStats(getMatchStats(view, searchText));
  }, [editorViewRef, searchText]);

  const handleReplaceNext = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !searchText) return;
    dispatchQuery(searchText, replaceText);
    replaceNext(view);
    setMatchStats(getMatchStats(view, searchText));
  }, [editorViewRef, searchText, replaceText, dispatchQuery]);

  const handleReplaceAll = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || !searchText) return;
    dispatchQuery(searchText, replaceText);
    replaceAll(view);
    setMatchStats(getMatchStats(view, searchText));
  }, [editorViewRef, searchText, replaceText, dispatchQuery]);

  if (!activeNote) return null;

  const hasSearch = searchText.length > 0;
  const showCount = hasSearch && matchStats.total > 0;

  return (
    <div className="flex flex-col border-b border-border bg-background">
      {/* Row 1: search field + navigation + toggle + menu */}
      <div className="flex items-center gap-1 px-2 py-1">
        {/* Search field */}
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded border border-border/50 bg-muted/40 px-2 py-0.5 focus-within:border-border">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            ref={findInputRef}
            type="text"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.shiftKey ? commitSearch(false) : commitSearch(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setSearchText("");
                dispatchQuery("", replaceText);
                setMatchStats({ current: 0, total: 0 });
              }
            }}
            placeholder="Find…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
          />

          {/* Match count — only shown after a committed search */}
          {showCount && (
            <span className="shrink-0 select-none text-xs tabular-nums text-muted-foreground/70">
              {matchStats.current > 0 ? matchStats.current : "–"} / {matchStats.total}
            </span>
          )}
        </div>

        {/* Up / down navigation */}
        <button
          type="button"
          title="Previous match (Shift+Enter)"
          disabled={!showCount}
          onClick={handleFindPrevious}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          title="Next match (Enter)"
          disabled={!showCount}
          onClick={handleFindNext}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Toggle replace */}
        <button
          type="button"
          title={showReplace ? "Close replace" : "Toggle replace"}
          onClick={() => setShowReplace((v) => !v)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold transition-colors ${
            showReplace
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {showReplace ? "×" : "R"}
        </button>

        {/* Note options menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            title="Note options"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded border border-border bg-card py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => { onRename(); setMenuOpen(false); }}
              >
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => { onDelete(); setMenuOpen(false); }}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={activeNote.isSecure}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                onClick={() => { onMakeSecure(); setMenuOpen(false); }}
              >
                Secure
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: replace (shown when toggle is active) */}
      {showReplace && (
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center rounded border border-border/50 bg-muted/40 px-2 py-0.5 focus-within:border-border">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => handleReplaceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleReplaceNext(); }
              }}
              placeholder="Replace…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Replace next */}
          <button
            type="button"
            title="Replace next"
            disabled={!hasSearch}
            onClick={handleReplaceNext}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.8} />
              <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.8} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 14v7M7 17h4m-4 0l-2-3m2 3l-2 3" />
            </svg>
          </button>

          {/* Replace all */}
          <button
            type="button"
            title="Replace all"
            disabled={!hasSearch}
            onClick={handleReplaceAll}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.8} />
              <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.8} />
              <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={1.8} />
              <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={1.8} />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
