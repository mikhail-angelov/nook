import { Dispatch, SetStateAction, useState, useRef, useEffect } from "react";
import { MODE } from "@/lib/utils";

type FooterProps = {
  root: string | null;
  loadingVault: boolean;
  openVault: () => Promise<void>;
  setMode: Dispatch<SetStateAction<MODE>>;
  mode: MODE;
  darkMode: boolean;
  onToggleDarkMode: () => void;
};

export function Footer({ root, openVault, loadingVault, setMode, mode, darkMode, onToggleDarkMode }: FooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-background px-3">
      {/* Center: mode toggle */}
      <div className="flex items-center rounded bg-muted p-0.5">
        <button
          type="button"
          className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
            mode === MODE.NOTES ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode(MODE.NOTES)}
        >
          Notes
        </button>
        <button
          type="button"
          className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
            mode === MODE.CHATS ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode(MODE.CHATS)}
        >
          Chats
        </button>
      </div>

      {/* Right: settings with chevron */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Settings"
        >
          Settings
          <svg
            className={`h-3 w-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown opens upward */}
        {menuOpen && (
          <div className="absolute bottom-full right-0 mb-1 w-56 rounded border border-border bg-card py-1 shadow-lg">
            {/* Vault section */}
            <div className="px-3 pb-1 pt-1.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Vault
              </div>
              {root ? (
                <div className="mb-1.5 truncate text-xs text-foreground" title={root}>
                  {root}
                </div>
              ) : (
                <div className="mb-1.5 text-xs text-muted-foreground/60">No vault open</div>
              )}
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  void openVault();
                  setMenuOpen(false);
                }}
                disabled={loadingVault}
              >
                {root ? "Change vault…" : "Open vault…"}
              </button>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Theme toggle */}
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() => {
                onToggleDarkMode();
                setMenuOpen(false);
              }}
            >
              <span className="text-foreground">Theme</span>
              <span className="text-muted-foreground">{darkMode ? "Dark" : "Light"}</span>
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
