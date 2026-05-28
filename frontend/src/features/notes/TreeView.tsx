export interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children: TreeNode[];
  note?: any;
}

interface TreeViewProps {
  nodes: TreeNode[];
  selectedId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onStartEdit: (nodeId: string, currentName: string, type: 'file' | 'folder') => void;
  editingNoteId: string | null;
  editingName: string | null;
  onEditChange: (name: string | null) => void;
  onEditBlur: () => void;
  onEditKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

interface NodeProps extends TreeViewProps {
  node: TreeNode;
  depth: number;
}

// Defined at module level so React sees a stable component type across renders.
// If defined inside TreeView, every render creates a new function reference and
// React unmounts/remounts the node — destroying the input cursor position.
function TreeNode({
  node,
  depth,
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
  nodes: _nodes,
}: NodeProps) {
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = node.type === 'file' && node.id === selectedId;
  const isEditing = editingNoteId === node.id;

  const sharedProps = {
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
    nodes: [],
  };

  const rowClass = `group flex items-center gap-1 rounded py-1.5 text-sm transition-colors ${
    isSelected
      ? 'bg-sidebar-border/60 text-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-border/30 hover:text-foreground'
  }`;

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft: `${depth * 14 + 6}px`, paddingRight: '6px' }}
      >
        {node.type === 'folder' ? (
          <>
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center opacity-60"
              onClick={() => onToggleFolder(node.id)}
              tabIndex={-1}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'}
                />
              </svg>
            </button>

            {isEditing ? (
              <input
                type="text"
                value={editingName ?? ''}
                onChange={(e) => onEditChange(e.target.value)}
                onBlur={onEditBlur}
                onKeyDown={onEditKeyDown}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium outline-none"
                onClick={() => onToggleFolder(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onStartEdit(node.id, node.name, 'folder');
                  }
                }}
                tabIndex={0}
              >
                {node.name}/
              </button>
            )}
          </>
        ) : (
          <>
            <span className="w-4 shrink-0" />

            {isEditing ? (
              <input
                type="text"
                value={editingName ?? ''}
                onChange={(e) => onEditChange(e.target.value)}
                onBlur={onEditBlur}
                onKeyDown={onEditKeyDown}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left outline-none"
                tabIndex={0}
                onClick={(e) => {
                  onSelectNote(node.id);
                  e.currentTarget.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onStartEdit(node.id, node.name, 'file');
                  }
                }}
              >
                {node.name}
              </button>
            )}
          </>
        )}
      </div>

      {node.type === 'folder' && isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} {...sharedProps} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView(props: TreeViewProps) {
  const { nodes, ...rest } = props;
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} depth={0} nodes={[]} {...rest} />
      ))}
    </div>
  );
}
