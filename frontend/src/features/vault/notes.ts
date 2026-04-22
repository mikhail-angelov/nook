import {
  vaultDeleteFile,
  vaultDecryptNote,
  vaultEncryptNote,
  vaultReadFile,
  vaultRenameFile,
  vaultWriteFile,
} from "./api";
import { parseNote } from "./parseNote";
import type { ScannedNote } from "./types";

export type Note = {
  id: string;
  path: string;
  title: string;
  body: string | null;
  isSecure: boolean;
  mtime: number;
  createdAt: number;
};

function isSecurePath(p: string): boolean {
  return p.endsWith(".md.sec");
}

export function scannedToNote(scanned: ScannedNote): Note {
  return {
    id: scanned.id,
    path: scanned.path,
    title: scanned.title,
    body: scanned.body,
    isSecure: scanned.is_secure,
    mtime: scanned.mtime,
    createdAt: scanned.created_at,
  };
}

export function noteToScanned(note: Note, body: string): ScannedNote {
  const parsed = parseNote(body, note.path);
  return {
    id: note.id,
    path: note.path,
    title: parsed.title,
    body,
    is_secure: note.isSecure,
    mtime: note.mtime,
    created_at: note.createdAt,
    tags: parsed.tags,
    wikilinks: parsed.wikilinks,
  };
}

export async function loadNote(
  id: string,
  vaultRoot: string,
  seed?: {
    mtime?: number;
    createdAt?: number;
    created_at?: number;
  },
): Promise<Note | null> {
  const secure = isSecurePath(id);
  const raw = secure
    ? await vaultDecryptNote(vaultRoot, id)
    : await vaultReadFile(vaultRoot, id);
  const parsed = parseNote(raw, id);
  return {
    id,
    path: id,
    title: parsed.title,
    body: raw,
    isSecure: secure,
    mtime: seed?.mtime ?? Math.floor(Date.now() / 1000),
    createdAt:
      seed?.createdAt ?? seed?.created_at ?? Math.floor(Date.now() / 1000),
  };
}

export async function saveNote(
  id: string,
  vaultRoot: string,
  body: string,
): Promise<Note> {
  if (isSecurePath(id)) {
    const row = await vaultEncryptNote(vaultRoot, id, body);
    return scannedToNote(row);
  }
  const mtime = await vaultWriteFile(vaultRoot, id, body);
  const parsed = parseNote(body, id);
  return {
    id,
    path: id,
    title: parsed.title,
    body,
    isSecure: false,
    mtime,
    createdAt: mtime,
  };
}

export async function createNote(
  vaultRoot: string,
  relPath: string,
  body: string,
): Promise<Note> {
  if (isSecurePath(relPath)) {
    throw new Error(
      "createNote refuses to create a secure note; use the secure-note API",
    );
  }
  return saveNote(relPath, vaultRoot, body);
}

export async function deleteNote(
  id: string,
  vaultRoot: string,
): Promise<void> {
  await vaultDeleteFile(vaultRoot, id);
}

export async function renameNote(
  id: string,
  newRelPath: string,
  vaultRoot: string,
): Promise<Note> {
  if (isSecurePath(id) || isSecurePath(newRelPath)) {
    throw new Error("renameNote: secure notes are not supported here");
  }
  const scanned = await vaultRenameFile(vaultRoot, id, newRelPath);
  return scannedToNote(scanned);
}

export async function makeNoteSecure(
  id: string,
  vaultRoot: string,
  body: string,
): Promise<Note> {
  const securePath = isSecurePath(id) ? id : `${id}.sec`;
  const row = await vaultEncryptNote(vaultRoot, securePath, body);
  return scannedToNote(row);
}
