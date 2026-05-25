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
  vaultWriteFile,
} from "@/features/vault/api";
import { getSettings, updateSettings } from "@/features/settings/api";
import { useVaultStore } from "@/features/vault/store";
import type { VaultEvent } from "@/features/vault/types";
import { Header } from "@/components/Header";
import { NotesPanel } from "@/features/notes/NotesPanel";
import { MODE } from "@/lib/utils";
import { QuickNoteDialog } from "@/features/quicknote/QuickNoteDialog";

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
  const [vaultEvent, setVaultEvent] = useState<VaultEvent | null>(null);
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
      await vaultStopWatching();
      await vaultStartWatching(folder);
      setRoot(folder);
      ingestScan(scanned);
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
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await onVaultEvent((event: VaultEvent) => {
        if (active) {
          setVaultEvent(event);
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
      void vaultStopWatching();
    };
  }, [applyEvent]);

  // Listen for system tray events
  useEffect(() => {
    let unlistenShow: (() => void) | undefined;
    let unlistenQuit: (() => void) | undefined;

    // Access Wails runtime directly without importing from wailsjs
    // (avoids module resolution failures in test environment)
    const rt =
      typeof window !== "undefined"
        ? (window as unknown as { runtime?: { EventsOn?: unknown } }).runtime
        : undefined;
    const wailsEventsOn = rt?.EventsOn as
      | ((event: string, cb: () => void) => Promise<() => void>)
      | undefined;

    if (wailsEventsOn) {
      void (async () => {
        try {
          unlistenShow = await wailsEventsOn("tray://show-window", () => {
            try {
              // @ts-expect-error - Wails runtime injected at build time
              window.runtime.WindowShow();
            } catch {
              // runtime not available
            }
          });
          unlistenQuit = await wailsEventsOn("tray://quit", () => {
            try {
              // @ts-expect-error - Wails runtime injected at build time
              window.runtime.Quit();
            } catch {
              // runtime not available
            }
          });
        } catch {
          // Failed to register event listeners
        }
      })();
    }

    return () => {
      unlistenShow?.();
      unlistenQuit?.();
    };
  }, []);

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
            vaultEvent={vaultEvent}
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

      <QuickNoteDialog
        vaultRoot={root}
        onSave={async (note) => {
          if (!root) return;
          const path = `quick-notes/${note.title}.md`;
          await vaultWriteFile(root, path, note.content);
          await hydrateVault(root);
        }}
      />
    </div>
  );
}
