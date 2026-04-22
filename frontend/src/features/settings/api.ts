import {
  GetSettings,
  UpdateSettings,
} from "../../../wailsjs/go/main/App";

export type Settings = {
  vaultFolder: string;
};

export async function getSettings(): Promise<Settings> {
  const raw = await GetSettings();
  return { vaultFolder: raw?.vaultFolder ?? "" };
}

export async function updateSettings(settings: Settings): Promise<void> {
  await UpdateSettings(settings);
}
