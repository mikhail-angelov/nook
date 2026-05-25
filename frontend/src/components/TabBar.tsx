import { useCallback } from "react";

export type TabItem = {
  id: string;
  title: string;
};

type TabBarProps = {
  tabs: TabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

export function TabBar({ tabs, activeId, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-border bg-muted/30">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

function Tab({
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
      className={`group flex shrink-0 cursor-pointer items-center gap-1 px-3 text-xs leading-none transition-colors
        ${
          isActive
            ? "border-b-2 border-accent bg-card text-foreground"
            : "border-b-2 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        }`}
      style={{ height: "calc(100% - 1px)" }}
      onClick={() => onSelect(tab.id)}
      onMouseDown={handleMiddleClick}
      title={tab.id}
    >
      <span className="truncate max-w-32">{tab.title || "Untitled"}</span>
      <button
        type="button"
        className="ml-0.5 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
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
