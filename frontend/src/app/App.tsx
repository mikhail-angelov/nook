import { useCallback, useEffect, useMemo, useState } from "react";

import { usePromptDialog } from "@/components/PromptDialog";
import { ChatPanel } from "@/features/ai/ChatPanel";
import {
  createProviderFromStoredKey,
  createWailsProviderApiKeyStore,
} from "@/features/ai/providerSecrets";

import { restoreSearchIndex } from "@/features/search/search";
import {
  onVaultEvent,
  vaultPickFolder,
  vaultScan,
  vaultStartWatching,
  vaultStopWatching,
} from "@/features/vault/api";
import { getSettings, updateSettings } from "@/features/settings/api";
import { useVaultStore } from "@/features/vault/store";
import type { VaultEvent } from "@/features/vault/types";
import { Header } from "@/components/Header";
import { NotesPanel } from "@/features/notes/NotesPanel";
import { MODE } from "@/lib/utils";

export default function App() {
  const [promptApi, promptModal] = usePromptDialog();
  const root = useVaultStore((state) => state.root);
  const noteMap = useVaultStore((state) => state.notes);
  const setRoot = useVaultStore((state) => state.setRoot);
  const ingestScan = useVaultStore((state) => state.ingestScan);
  const removeNote = useVaultStore((state) => state.removeNote);
  const upsertNote = useVaultStore((state) => state.upsertNote);
  const applyEvent = useVaultStore((state) => state.applyEvent);

  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<MODE>(MODE.NOTES);
  const [loadingVault, setLoadingVault] = useState(false);
  const providerStore = useMemo(() => createWailsProviderApiKeyStore(), []);

  const resolveProvider = useCallback(
    async (providerId: "anthropic" | "openai" | "deepseek") => {
      return createProviderFromStoredKey(providerId, providerStore);
    },
    [providerStore],
  );

  const requestApiKey = useCallback(
    async (providerId: "anthropic" | "openai" | "deepseek") => {
      const apiKey = await promptApi.prompt(`${providerId} API key`, {
        defaultValue: "",
      });
      if (!apiKey) {
        return null;
      }
      await providerStore.save(providerId, apiKey);
      return apiKey;
    },
    [promptApi, providerStore],
  );

  const hydrateVault = useCallback(
    async (folder: string) => {
      const scanned = await vaultScan(folder);
      await restoreSearchIndex(folder, scanned);
      setRoot(folder);
      // setSecureUnlocked(false);
      ingestScan(scanned);
      // setSelectedId(scanned[0]?.id ?? null);
      // setActiveNote(null);
      //setSearchQuery("");
      // setSearchIds(null);
    },
    [ingestScan, setRoot],
  );

  const openVault = useCallback(async () => {
    try {
      setLoadingVault(true);
      setStatus(null);
      const folder = await vaultPickFolder();
      if (!folder) return;
      await hydrateVault(folder);
      await updateSettings({ vaultFolder: folder });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to open vault",
      );
    } finally {
      setLoadingVault(false);
    }
  }, [hydrateVault]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getSettings();
        if (cancelled || !settings.vaultFolder) return;
        setLoadingVault(true);
        await hydrateVault(settings.vaultFolder);
      } catch (error) {
        if (cancelled) return;
        setStatus(
          error instanceof Error ? error.message : "Failed to open saved vault",
        );
      } finally {
        if (!cancelled) setLoadingVault(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateVault]);

  useEffect(() => {
    if (!root) {
      // setSelectedId(null);
      // setActiveNote(null);
      // setSecureUnlocked(false);
      return;
    }
    let cancelled = false;
    void vaultStartWatching(root);
    return () => {
      cancelled = true;
      void vaultStopWatching();
      if (cancelled) return;
    };
  }, [root]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await onVaultEvent((event: VaultEvent) => {
        if (active) {
          applyEvent(event);
        }
      });
      if (!active) {
        unlisten?.();
      }
    })();
    return () => {
      active = false;
      unlisten?.();
    };
  }, [applyEvent]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_45%),linear-gradient(180deg,#fbfbf8_0%,#f2efe7_100%)] text-foreground">
      <Header root={root} loadingVault={loadingVault} openVault={openVault} setMode={setMode} mode={mode}/>

        {mode === MODE.NOTES ? (
          <NotesPanel
            root={root}
            status={status}
            promptApi={promptApi}
            noteMap={noteMap}
            upsertNote={upsertNote}
            removeNote={removeNote}
            openVault={openVault}
          />
        ) : (
          <ChatPanel
            vaultRoot={root}
            resolveProvider={resolveProvider}
            requestApiKey={requestApiKey}
            requestExtractPath={async () =>
              promptApi.prompt("Extract note", {
                defaultValue: "notes/extracted-chat.md",
              })
            }
          />
        )}

      {promptModal}
    </div>
  );
}
