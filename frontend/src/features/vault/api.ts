import {
  ChangeSecurePassword,
  DecryptNote,
  EncryptNote,
  VaultDeleteFile,
  VaultPickFolder,
  VaultReadFile,
  VaultRenameFile,
  VaultScan,
  UnlockSecure,
  VaultStartWatching,
  VaultStopWatching,
  VaultWriteFile,
} from "../../../wailsjs/go/main/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";

import type { ScannedNote, VaultEvent } from "./types";

export async function vaultPickFolder(): Promise<string | null> {
  const result = await VaultPickFolder();
  return result && result.length > 0 ? result : null;
}

export async function vaultScan(root: string): Promise<ScannedNote[]> {
  const rows = (await VaultScan(root)) ?? [];
  return rows.map(normalizeScannedNote);
}

export async function vaultReadFile(
  root: string,
  relPath: string,
): Promise<string> {
  return VaultReadFile(root, relPath);
}

export async function vaultDecryptNote(
  root: string,
  relPath: string,
): Promise<string> {
  return DecryptNote(root, relPath);
}

export async function vaultWriteFile(
  root: string,
  relPath: string,
  contents: string,
): Promise<number> {
  return VaultWriteFile(root, relPath, contents);
}

export async function vaultEncryptNote(
  root: string,
  relPath: string,
  contents: string,
): Promise<ScannedNote> {
  const row = await EncryptNote(root, relPath, contents);
  return normalizeScannedNote(row);
}

export async function vaultUnlockSecure(
  root: string,
  password: string,
): Promise<void> {
  await UnlockSecure(root, password);
}

export async function vaultChangeSecurePassword(
  root: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await ChangeSecurePassword(root, oldPassword, newPassword);
}

export async function vaultDeleteFile(
  root: string,
  relPath: string,
): Promise<void> {
  await VaultDeleteFile(root, relPath);
}

export async function vaultRenameFile(
  root: string,
  oldRelPath: string,
  newRelPath: string,
): Promise<ScannedNote> {
  const row = await VaultRenameFile(root, oldRelPath, newRelPath);
  return normalizeScannedNote(row);
}

export async function vaultStartWatching(root: string): Promise<void> {
  await VaultStartWatching(root);
}

export async function vaultStopWatching(): Promise<void> {
  await VaultStopWatching();
}

export async function onVaultEvent(
  handler: (event: VaultEvent) => void,
): Promise<() => void> {
  const unlisten = EventsOn("vault://event", (raw: unknown) => {
    const normalized = normalizeVaultEvent(raw);
    if (normalized) handler(normalized);
  });
  return unlisten;
}

function normalizeScannedNote(row: {
  id: string;
  path: string;
  title: string;
  body?: string | null;
  is_secure: boolean;
  mtime: number;
  created_at: number;
  tags?: string[] | null;
  wikilinks?: string[] | null;
}): ScannedNote {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    body: row.body ?? null,
    is_secure: Boolean(row.is_secure),
    mtime: row.mtime,
    created_at: row.created_at,
    tags: row.tags ?? [],
    wikilinks: row.wikilinks ?? [],
  };
}

function normalizeVaultEvent(raw: unknown): VaultEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { kind?: unknown; data?: unknown };
  if (typeof obj.kind !== "string") return null;
  switch (obj.kind) {
    case "Created":
    case "Modified":
    case "Deleted":
      if (typeof obj.data !== "string") return null;
      return { kind: obj.kind, data: obj.data };
    case "Renamed": {
      const d = obj.data as { from?: unknown; to?: unknown } | null;
      if (!d || typeof d.from !== "string" || typeof d.to !== "string") {
        return null;
      }
      return { kind: "Renamed", data: { from: d.from, to: d.to } };
    }
    default:
      return null;
  }
}
