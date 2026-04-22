import { Dispatch, SetStateAction, useState, useRef, useEffect } from "react";
import { MODE } from "@/lib/utils";

type HeaderProps = {
  root: string | null;
  loadingVault: boolean;
  openVault: () => Promise<void>;
  setMode: Dispatch<SetStateAction<MODE>>;
  mode: MODE;
};

export function Header({ root, openVault, loadingVault, setMode, mode }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
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
    <header className="flex items-center justify-between border-b border-black/10 bg-white/70 px-6 py-4 backdrop-blur">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nook</h1>
        <p className="text-sm text-muted-foreground">
          {root ? `Vault: ${root}` : "Open a vault to begin"}
        </p>
      </div>
      
      <div className="flex items-center">
        <div className="flex rounded-lg border border-black/10 bg-white/50 p-1">
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === MODE.NOTES
                ? "bg-black text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => setMode(MODE.NOTES)}
          >
            Notes
          </button>
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === MODE.CHATS
                ? "bg-black text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => setMode(MODE.CHATS)}
          >
            Chats
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="rounded-md border border-black/10 bg-white p-2 text-gray-700 hover:bg-gray-100"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-md border border-black/10 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
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
