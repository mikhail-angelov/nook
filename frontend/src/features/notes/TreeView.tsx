export interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children: TreeNode[];
  note?: any; // ScannedNote type, but we'll keep it generic
}

interface TreeViewProps {
  nodes: TreeNode[];
  selectedId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onStartEdit: (nodeId: string, currentPath: string) => void;
  editingNoteId: string | null;
  editingName: string;
  onEditChange: (name: string) => void;
  onEditBlur: () => void;
  onEditKeyDown: (event: React.KeyboardEvent) => void;
}

export function TreeView({
  nodes,
  selectedId,
  expandedFolders,
  onToggleFolder,
  onSelectNote,
  onStartEdit,
  editingNoteId,
  editingName,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
}: TreeViewProps) {
  const TreeNodeComponent = ({ node, depth = 0 }: { node: TreeNode, depth?: number }) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = node.type === 'file' && node.id === selectedId;

    return (
      <div>
        <div
          className={`flex items-center rounded-lg border px-3 py-2 text-sm transition ${
            isSelected
              ? "border-black/20 bg-black text-white shadow-sm"
              : "border-transparent bg-white/80 hover:border-black/10 hover:bg-white"
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {node.type === 'folder' ? (
            <>
              <button
                type="button"
                className="mr-2 flex h-4 w-4 items-center justify-center"
                onClick={() => onToggleFolder(node.id)}
                aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
              >
                {isExpanded ? (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
              {editingNoteId === node.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={onEditBlur}
                  onKeyDown={onEditKeyDown}
                  className="flex-1 bg-transparent outline-none"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left outline-none"
                  onClick={() => onToggleFolder(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onStartEdit(node.id, node.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <span className="font-medium truncate">
                    {node.name}/
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mr-2 w-4" /> {/* Spacer for alignment */}
              {editingNoteId === node.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={onEditBlur}
                  onKeyDown={onEditKeyDown}
                  className="flex-1 bg-transparent outline-none"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  aria-label={node.name}
                  onClick={() => onSelectNote(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onStartEdit(node.id, node.id);
                    }
                  }}
                  className="flex-1 text-left outline-none"
                  tabIndex={0}
                >
                  <span className="font-medium truncate">
                    {node.name}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
        
        {node.type === 'folder' && isExpanded && node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map((child) => (
              <TreeNodeComponent key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeNodeComponent key={node.id} node={node} />
      ))}
    </div>
  );
}
