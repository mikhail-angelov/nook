type WailsAppBridge = {
  ProviderApiKeyLoad?(providerId: string): Promise<string | null>;
  ProviderApiKeySave?(providerId: string, apiKey: string): Promise<void>;
  ProviderApiKeyDelete?(providerId: string): Promise<void>;
  ProviderApiKeyList?(): Promise<string[]>;
  ChatListSessionIDs?(root: string): Promise<string[]>;
  ChatReadSessionFile?(root: string, sessionId: string): Promise<string>;
  ChatAppendSessionLine?(
    root: string,
    sessionId: string,
    line: string,
  ): Promise<void>;
  ChatReadSessionMeta?(root: string, sessionId: string): Promise<string>;
  ChatWriteSessionMeta?(
    root: string,
    sessionId: string,
    metadata: string,
  ): Promise<void>;
  ChatRenameSession?(
    root: string,
    oldSessionId: string,
    newSessionId: string,
  ): Promise<{ id: string; title: string }>;
  ChatDeleteSession?(root: string, sessionId: string): Promise<void>;
};

function getAppBridge(): WailsAppBridge | null {
  const bridge = (globalThis as unknown as {
    go?: { main?: { App?: WailsAppBridge } };
  }).go?.main?.App;
  return bridge ?? null;
}

export async function loadProviderApiKey(
  providerId: string,
): Promise<string | null> {
  const bridge = getAppBridge();
  if (!bridge?.ProviderApiKeyLoad) {
    return null;
  }
  return bridge.ProviderApiKeyLoad(providerId);
}

export async function saveProviderApiKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ProviderApiKeySave?.(providerId, apiKey);
}

export async function deleteProviderApiKey(providerId: string): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ProviderApiKeyDelete?.(providerId);
}

export async function listProviderApiKeys(): Promise<string[]> {
  const bridge = getAppBridge();
  if (!bridge?.ProviderApiKeyList) {
    return [];
  }
  return bridge.ProviderApiKeyList();
}

export async function invokeAiCommand(
  _command: string,
  _args?: any,
): Promise<any> {
  console.warn("AI functionality not implemented in Wails version");
  return Promise.resolve(null);
}

export async function chatAppendSessionLine(
  vaultRoot: string,
  sessionId: string,
  line: string,
): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ChatAppendSessionLine?.(vaultRoot, sessionId, line);
}

export async function chatReadSessionFile(
  vaultRoot: string,
  sessionId: string,
): Promise<string> {
  const bridge = getAppBridge();
  if (!bridge?.ChatReadSessionFile) {
    return "";
  }
  return bridge.ChatReadSessionFile(vaultRoot, sessionId);
}

export async function chatListSessionIds(vaultRoot: string): Promise<string[]> {
  const bridge = getAppBridge();
  if (!bridge?.ChatListSessionIDs) {
    return [];
  }
  return bridge.ChatListSessionIDs(vaultRoot);
}

export async function chatReadSessionMeta(
  vaultRoot: string,
  sessionId: string,
): Promise<string | null> {
  const bridge = getAppBridge();
  if (!bridge?.ChatReadSessionMeta) {
    return null;
  }
  try {
    return await bridge.ChatReadSessionMeta(vaultRoot, sessionId);
  } catch {
    return null;
  }
}

export async function chatWriteSessionMeta(
  vaultRoot: string,
  sessionId: string,
  metadata: string,
): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ChatWriteSessionMeta?.(vaultRoot, sessionId, metadata);
}

export async function chatRenameSession(
  vaultRoot: string,
  oldSessionId: string,
  newSessionId: string,
): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ChatRenameSession?.(vaultRoot, oldSessionId, newSessionId);
}

export async function chatDeleteSession(
  vaultRoot: string,
  sessionId: string,
): Promise<void> {
  const bridge = getAppBridge();
  await bridge?.ChatDeleteSession?.(vaultRoot, sessionId);
}
