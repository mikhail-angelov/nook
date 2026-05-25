import {
  GetSettings,
  UpdateSettings,
} from "../../../wailsjs/go/main/App";

export type Settings = {
  vaultFolder: string;
  lastOpenedNote?: string;
  darkMode?: boolean;
};

export async function getSettings(): Promise<Settings> {
  const raw = await GetSettings();
  return {
    vaultFolder: raw?.vaultFolder ?? "",
    lastOpenedNote: raw?.lastOpenedNote ?? undefined,
    darkMode: raw?.darkMode ?? undefined,
  };
}

export async function updateSettings(settings: Settings): Promise<void> {
  await UpdateSettings(settings);
}
