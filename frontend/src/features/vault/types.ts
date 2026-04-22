
/**
 * One note discovered during `scan_vault`. `id` is the vault-relative path
 * (stable across rescans); `body` is `null` for secure `.md.sec` files.
 */
export type ScannedNote = {
  id: string;
  path: string;
  title: string;
  body: string | null;
  is_secure: boolean;
  mtime: number;
  created_at: number;
  tags: string[];
  wikilinks: string[];
};

/**
 * Filesystem event emitted by the Rust watcher over `vault://event`. The
 * Rust enum uses `#[serde(tag = "kind", content = "data")]`, so on the wire
 * each variant looks like `{ "kind": "Modified", "data": "notes/a.md" }` —
 * the Renamed variant carries `{ from, to }` instead.
 */
export type VaultEvent =
  | { kind: "Created"; data: string }
  | { kind: "Modified"; data: string }
  | { kind: "Deleted"; data: string }
  | { kind: "Renamed"; data: { from: string; to: string } };
