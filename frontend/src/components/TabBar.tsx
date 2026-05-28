import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TabItem = {
  id: string;
  title: string;
};

type TabBarProps = {
  tabs: TabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onSelectFromOverflow: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onNewNote?: () => void;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onSelectFromOverflow,
  onClose,
  onCloseAll,
  onNewNote,
}: TabBarProps) {
  // Observe only the tab scroll area (controls are siblings, excluded automatically)
  const tabAreaRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [tabAreaWidth, setTabAreaWidth] = useState(9999);
  const [measuredWidths, setMeasuredWidths] = useState<number[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const el = tabAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTabAreaWidth(el.clientWidth));
    ro.observe(el);
    setTabAreaWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const widths = Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth);
    setMeasuredWidths(widths);
  }, [tabs]);

  const { visibleTabs, hiddenTabs } = useMemo(() => {
    if (measuredWidths.length < tabs.length) {
      return { visibleTabs: tabs, hiddenTabs: [] as TabItem[] };
    }
    let cum = 0;
    for (let i = 0; i < tabs.length; i++) {
      cum += measuredWidths[i] ?? 0;
      if (cum > tabAreaWidth) {
        return { visibleTabs: tabs.slice(0, i), hiddenTabs: tabs.slice(i) };
      }
    }
    return { visibleTabs: tabs, hiddenTabs: [] as TabItem[] };
  }, [tabAreaWidth, measuredWidths, tabs]);

  const dropdownEnabled = tabs.length > 1 || hiddenTabs.length > 0;

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    // Outer row — NO overflow-hidden so the dropdown can escape downward
    <div className="flex h-9 shrink-0 border-b border-border bg-muted/20">
      {/* Tab scroll area — this one clips, not the outer row */}
      <div ref={tabAreaRef} className="relative min-w-0 flex-1 overflow-hidden">
        {/* Hidden measurement clone — invisible, gives us each tab's natural width */}
        <div
          ref={measureRef}
          className="pointer-events-none absolute left-0 top-0 flex"
          style={{ visibility: "hidden" }}
          aria-hidden="true"
        >
          {tabs.map((tab) => (
            <TabChip key={`m-${tab.id}`} tab={tab} isActive={false} onSelect={() => {}} onClose={() => {}} />
          ))}
        </div>

        {/* Visible tabs */}
        <div className="flex h-full">
          {visibleTabs.map((tab) => (
            <TabChip
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeId}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </div>
      </div>

      {/* Controls — sibling of tab area, outside overflow clip */}
      <div className="flex shrink-0 items-center px-1">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onNewNote}
          title="New note"
          aria-label="New note"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            onClick={() => setDropdownOpen((o) => !o)}
            title="Tab list"
            aria-label="Tab list"
            disabled={!dropdownEnabled}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-border bg-card py-1 shadow-lg">
              {/* Close all except active */}
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  onCloseAll();
                  setDropdownOpen(false);
                }}
              >
                Close all except active
              </button>

              {hiddenTabs.length > 0 && <div className="my-1 border-t border-border" />}

              {/* Overflow tabs */}
              {hiddenTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`group flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted ${
                    tab.id === activeId ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => {
                    onSelectFromOverflow(tab.id);
                    setDropdownOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{tab.title || "Untitled"}</span>
                  <button
                    type="button"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-border group-hover:opacity-60"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.id);
                      if (hiddenTabs.length <= 1) setDropdownOpen(false);
                    }}
                    aria-label="Close tab"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabChip({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: TabItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        onClose(tab.id);
      }
    },
    [onClose, tab.id],
  );

  return (
    <div
      className={`group relative flex h-full shrink-0 cursor-pointer select-none items-center gap-1 border-r border-border/50 px-3 text-xs transition-colors ${
        isActive
          ? "bg-background text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
      onClick={() => onSelect(tab.id)}
      onMouseDown={handleMiddleClick}
      title={tab.id}
    >
      {/* Active indicator: gray bottom underscore */}
      {isActive && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-muted-foreground/40" />}
      <span className="max-w-36 truncate">{tab.title || "Untitled"}</span>
      <button
        type="button"
        className={`ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity hover:bg-muted ${
          isActive ? "opacity-60 group-hover:opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        aria-label="Close tab"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
