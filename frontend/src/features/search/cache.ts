import { vaultReadFile, vaultWriteFile } from "@/features/vault/api";

import type { SearchSnapshot } from "./index";

const CACHE_PATH = ".app/fts.json";

export async function loadSearchCache(
  vaultRoot: string,
): Promise<SearchSnapshot | null> {
  try {
    const raw = await vaultReadFile(vaultRoot, CACHE_PATH);
    const parsed = JSON.parse(raw) as SearchSnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.notes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSearchCache(
  vaultRoot: string,
  index: { toJSON(): SearchSnapshot },
): Promise<void> {
  await vaultWriteFile(vaultRoot, CACHE_PATH, JSON.stringify(index.toJSON()));
}
