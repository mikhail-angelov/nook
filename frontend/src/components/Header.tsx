import { Dispatch, SetStateAction, useState, useRef, useEffect } from "react";
import { MODE } from "@/lib/utils";

type HeaderProps = {
  root: string | null;
  loadingVault: boolean;
  openVault: () => Promise<void>;
  setMode: Dispatch<SetStateAction<MODE>>;
  mode: MODE;
  darkMode: boolean;
  onToggleDarkMode: () => void;
};

export function Header({ root, openVault, loadingVault, setMode, mode, darkMode, onToggleDarkMode }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      {/* Left: App name + vault path */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">nook</span>
        {root ? (
          <span className="truncate max-w-64">{root}</span>
        ) : (
          <span>No vault open</span>
        )}
      </div>

      {/* Center: Mode toggle */}
      <div className="flex items-center rounded-md bg-muted p-0.5">
        <button
          type="button"
          className={`rounded px-3 py-0.5 text-xs font-medium transition-colors ${
            mode === MODE.NOTES
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode(MODE.NOTES)}
        >
          Notes
        </button>
        <button
          type="button"
          className={`rounded px-3 py-0.5 text-xs font-medium transition-colors ${
            mode === MODE.CHATS
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode(MODE.CHATS)}
        >
          Chats
        </button>
      </div>

      {/* Right: Vault menu + dark mode toggle */}
      <div className="flex items-center gap-1">
        {/* Dark mode toggle */}
        <button
          type="button"
          aria-label="Toggle dark mode"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onToggleDarkMode}
        >
          {darkMode ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Vault menu"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted disabled:opacity-60"
              onClick={() => {
                openVault();
                setMenuOpen(false);
              }}
              disabled={loadingVault}
            >
              {root ? "Open another vault" : "Open vault"}
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
