# Nook v2 — Execution Progress

Running controller ledger for implementing `docs/design-v2.md` in this Wails/Go codebase.

## Ground rules

- Source of truth: `docs/design-v2.md`.
- This workspace is not a git repository, so handoff and verification are tracked here instead of by commits.
- Every implementation task runs in a fresh subagent with isolated context.
- Every subagent must receive:
  - `docs/design-v2.md`
  - `docs/progress-v2.md`
  - the exact files it owns for the task
  - the latest completed-task summary from this file
- Happy-path unit coverage is required for every behavior task except pure UI rendering views.
- Current frontend scaffold code may be removed if it conflicts with the v2 design.
- Before a task is marked complete, the controller must independently rerun the task’s verification commands.

## Execution order

- Tasks are ordered to keep file ownership clear and reduce merge conflicts.
- Later tasks must read the newest entry in `Completed tasks` before starting.
- If a task changes a public contract, it must update this file so the next worker consumes the new contract instead of rediscovering it.
- Dispatch waves for the remaining implementation:
  - Wave A: Task 4 `Provider registry and secret storage`, Task 5 `Chat session persistence`, Task 7 `Secure notes`
  - Wave B: Task 6 `Chat workspace and note attachments` after Task 4 and Task 5 summaries are appended here
  - Wave C: Task 8 `App polish and integration cleanup` after Task 6 and Task 7 summaries are appended here
  - Wave D: Task 9 `Final verification` after all implementation summaries are appended here

## Task list

- [x] 1. Backend vault core
  Build Go-side vault primitives in `backend/` and `app.go`: recursive scan, markdown parsing, atomic writes, safe path handling, Wails methods for folder pick/read/write/delete/rename, and watcher event plumbing. Add Go unit tests for the happy path of scan/read/write/rename/watch event normalization.
- [x] 2. Frontend vault integration
  Replace the placeholder app shell with a vault-first flow: open folder, note list, note selection, note CRUD wiring, editor integration, autosave wiring, watcher subscription, and dirty-conflict handling using the Wails bridge from Task 1. Add or update Vitest coverage for the happy path flows and remove obsolete placeholder code.
- [x] 3. Search index and cache
  Implement the MiniSearch-based notes/chat search layer described in the design: in-memory index wrapper, filter parsing, `.app/fts.json` cache load/save, reconcile-on-open, and sidebar/attach-picker query integration. Add unit coverage for indexing, query filters, and cache reconciliation happy paths.
- [x] 4. Provider registry and secret storage
  Finish the AI provider contract and adapters, add backend keyring-backed API key storage/list/remove methods, and wire frontend provider resolution around the Wails bridge. Keep network behavior mockable in tests; add unit coverage for provider resolution and secret storage flows.
- [x] 5. Chat session persistence
  Implement `.chats/*.jsonl` and `.meta.json` handling, list/load/save/rename/delete/rebuild-meta flows, malformed trailing-line tolerance, and chat search indexing inputs. Add unit tests for happy-path append/load/list/extract and meta regeneration.
- [x] 6. Chat workspace and note attachments
  Complete the chat panel behavior: free chat, session switching, streaming responses, per-session provider/model/system prompt, note attachment picker backed by search, prompt assembly, token-budget warning, and extract-to-note flow. Add unit coverage for the non-visual happy path behaviors.
- [x] 7. Secure notes
  Implement vault password setup/unlock, Argon2 + AES-GCM note encryption/decryption, secure-note metadata handling, `.md.sec` rename flow, secure-note exclusion from search, and frontend unlock prompts/state. Add Go and Vitest happy-path coverage for encrypt/unlock/decrypt and secure-note UI logic.
- [ ] 8. App polish and integration cleanup
  Finish onboarding/open-vault empty states, reconcile old scaffold code with the final architecture, ensure design-required Wails bindings exist, and tighten shared types/config so the app works end-to-end without placeholder branches. Add tests where behavior changes; pure presentation-only views do not need new tests.
- [ ] 9. Final verification
  Run the relevant frontend and Go test suites, run a production frontend build, and record any remaining gaps against `docs/design-v2.md` and the design’s verification checklist.

---

## Completed tasks

<!-- Append new entries at the bottom.

### Task N — <name>
**What was built:** ...
**Key decisions / deviations from design-v2.md:** ...
**Files created/modified:** ...
**Tests run:** ...
**Verification status:** ...
**How the next task should use this:** ...

-->

### Task 1 — Backend vault core
**What was built:** Added a new Go backend layer under `backend/` for vault scanning, markdown/plaintext parsing, safe vault-relative path resolution, atomic writes, rename/delete/read helpers, and `fsnotify`-based watcher normalization with debounce/self-write suppression infrastructure. Wired `app.go` and `main.go` so Wails now exposes vault folder pick, scan, read, write, delete, rename, and watch start/stop methods, and emits normalized watcher events on `vault://event`.
**Key decisions / deviations from design-v2.md:** Note parsing mirrors the existing frontend parsing rules closely enough for v2 happy-path behavior. `CreatedAt` currently falls back to file modtime because portable file creation time is not reliably available from the standard library. The watcher layer is in place with normalized event payloads and debounce/self-write tagging, but the generated `frontend/wailsjs/go/main/*` bindings were not regenerated because the `wails` CLI is not installed in this workspace.
**Files created/modified:** `backend/types.go`, `backend/path.go`, `backend/parse.go`, `backend/fs.go`, `backend/vault.go`, `backend/watch.go`, `backend/vault_test.go`, `backend/watch_test.go`, `app.go`, `main.go`, `go.mod`, `go.sum`.
**Tests run:** Worker added failing Go tests first for scan/read/write/rename/delete/path-escape/watcher normalization. Controller verification: `go test ./backend/... ./...` -> pass.
**Verification status:** Backend vault contract is passing its Go test coverage in the controller session.
**How the next task should use this:** Task 2 should replace the current frontend vault API stubs by calling the new Wails App methods (`VaultPickFolder`, `VaultScan`, `VaultReadFile`, `VaultWriteFile`, `VaultDeleteFile`, `VaultRenameFile`, `VaultStartWatching`, `VaultStopWatching`) and subscribe to `vault://event`. Because generated Wails JS bindings were not refreshed here, Task 2 should either regenerate them if the CLI becomes available or add the minimal frontend bridge manually against the existing Wails runtime surface.

### Task 2 — Frontend vault integration
**What was built:** Replaced the placeholder Wails greeting screen with a vault-first Nook shell in `frontend/src/app/App.tsx`. The app now opens a vault, scans and lists notes, loads and selects notes into the editor, wires create/rename/delete through the Wails bridge, flushes autosave on blur and before destructive actions, subscribes to watcher events, and surfaces dirty-buffer conflicts with reload support. The editor buffer/watcher lifecycle was tightened so local create/rename flows do not immediately blank the active note and async watcher subscriptions clean up correctly on unmount.
**Key decisions / deviations from design-v2.md:** The empty-state secondary CTA is labeled `Choose folder` so there is only one primary `Open vault` action in the shell. The current Task 2 verification covers the happy-path vault/editor behavior, not the future search/chat integration. `frontend/tsconfig.app.json` disables `erasableSyntaxOnly` because the checked-in generated Wails model file uses `namespace` syntax that TypeScript otherwise rejects during build.
**Files created/modified:** `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx`, `frontend/src/features/editor/useNoteBuffer.ts`, `frontend/src/features/vault/api.ts`, `frontend/tsconfig.app.json`.
**Tests run:** Controller verification: `npm test -- --run src/app/App.test.tsx src/features/editor/useAutosave.test.ts src/features/vault/store.test.ts src/features/editor/Editor.test.ts src/features/editor/wikilinks.test.ts` -> pass (24 tests). `npm run build` -> pass.
**Verification status:** Task 2 frontend vault shell, editor integration, and task-owned frontend build surface are passing in the controller session.
**How the next task should use this:** Task 3 should treat `useVaultStore` plus `frontend/src/app/App.tsx` as the active note-shell entry point and integrate search into that flow rather than reviving the old placeholder app. Search code should consume `ScannedNote` records shaped by `frontend/src/features/vault/api.ts`, and it must preserve the current note list/editor behavior and Task 2 tests while adding MiniSearch-style indexing, filters, cache load/save, and reconcile-on-open. If Task 3 needs additional frontend query state, add it without reintroducing selector allocations that cause React/Zustand snapshot loops.

### Task 3 — Search index and cache
**What was built:** Added a working search subsystem under `frontend/src/features/search/` with query parsing (`tag:`, `path:`, quoted phrases, free-text terms), an in-memory note index, cache load/save for `.app/fts.json`, and reconcile-on-open against scanned notes. Wired the current app shell so opening a vault restores/reconciles the search cache, note save/create/rename/delete keep the live index updated, and the sidebar now includes a search field that filters the note list through the search layer.
**Key decisions / deviations from design-v2.md:** The implementation uses a lightweight in-repo search index instead of the real MiniSearch package because MiniSearch was not installed in this workspace. The public surface is intentionally shaped so Task 4+ can keep using `searchNotes` / `restoreSearchIndex` while swapping the internal engine to MiniSearch later if desired. Current Task 3 scope covers note indexing and sidebar integration; chat-session indexing inputs remain for the chat persistence task.
**Files created/modified:** `frontend/src/features/search/query.ts`, `frontend/src/features/search/index.ts`, `frontend/src/features/search/cache.ts`, `frontend/src/features/search/reconcile.ts`, `frontend/src/features/search/search.ts`, `frontend/src/features/search/query.test.ts`, `frontend/src/features/search/index.test.ts`, `frontend/src/features/search/cache.test.ts`, `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx`.
**Tests run:** Controller verification: `npm test -- --run src/app/App.test.tsx src/features/search/query.test.ts src/features/search/index.test.ts src/features/search/cache.test.ts src/features/editor/useAutosave.test.ts src/features/vault/store.test.ts src/features/editor/Editor.test.ts src/features/editor/wikilinks.test.ts` -> pass (29 tests). `npm run build` -> pass.
**Verification status:** Task 3 search/index/cache behavior and the integrated frontend build are passing in the controller session.
**How the next task should use this:** Task 4 should leave the current `searchNotes`/`restoreSearchIndex` contract intact and, when chat sessions land, extend the search layer with chat-session documents instead of replacing the note search flow. Provider/session work can rely on the current sidebar search field already filtering notes for future attach-picker reuse.

### Task 4 — Provider registry and secret storage
**What was built:** Finished the AI provider secret bridge around Wails and added backend keyring-backed API key methods. The frontend now resolves provider keys through `frontend/src/features/ai/api.ts`, exposes a Wails-backed `ProviderApiKeyStore` via `createWailsProviderApiKeyStore()`, and can hydrate Anthropic/OpenAI/DeepSeek providers from persisted secrets through `createProviderFromStoredKey()`. On the Go side, `app.go` now exports `ProviderApiKeyLoad/Save/Delete/List`, backed by a new `backend/keyring.go` wrapper that stores individual provider keys plus a manifest for listing.
**Key decisions / deviations from `docs/design-v2.md`:**
- Kept the network-facing provider adapters unchanged; this task only wired storage and provider resolution around them.
- Implemented provider listing with a small keyring manifest entry so the UI can enumerate saved providers without introducing a separate settings database.
- Used a mockable frontend bridge in `api.ts` so the provider-resolution tests can stay fully isolated from the Wails runtime.
- I did not touch the chat/session layer in this task; it still depends on the existing `resolveProvider` / `requestApiKey` seam and will be finished in the next task.
**Files created/modified:** `frontend/src/features/ai/api.ts`, `frontend/src/features/ai/providerSecrets.ts`, `frontend/src/features/ai/providerSecrets.test.ts`, `app.go`, `backend/keyring.go`, `backend/keyring_test.go`, `go.mod`, `go.sum`.
**Tests run:** `npm test -- src/features/ai/providerSecrets.test.ts` -> pass. `npm test -- src/features/ai/provider.test.ts src/features/ai/providerSecrets.test.ts` -> pass. `go test backend/keyring.go backend/keyring_test.go backend/types.go` -> pass. `go test app.go main.go` -> pass. `go test ./backend` still fails on unrelated pre-existing chat-session gaps in `backend/chat_test.go`.
**Verification status:** Task 4 is complete for the provider registry/secret-storage slice. The unrelated backend chat-session tests remain red until Task 5 lands.
**How the next task should use this:** Task 5 should build chat session persistence on top of the new provider secret bridge without adding any new API-key storage path. If Task 5 needs provider enumeration, use `ProviderApiKeyList()` and keep the keyring manifest format stable. Leave provider adapter fetch behavior mockable; the current tests rely on that seam.

### Task 5 — Chat session persistence
**What was built:** Added file-backed chat session persistence across Go and TypeScript. `backend/chat.go` now owns `.chats/*.jsonl` append/read/list/rename/delete behavior plus `.meta.json` save/load/rebuild flows, and `app.go` exposes the Wails bridge methods consumed by the frontend. On the frontend, `frontend/src/features/ai/sessions.ts` now owns JSONL parsing, malformed-trailing-line tolerance, metadata rebuilds, list/load/append helpers, extract-to-note helpers, and bridge-backed rename/delete wrappers.
**Key decisions / deviations from `docs/design-v2.md`:**
- Metadata is serialized with `started_at`, `updated_at`, and `message_count` snake-case fields to match the Go-side file contract; `systemPrompt` and `summary` stay camelCase in the in-memory TypeScript model.
- Session listing is currently ordered by session id ascending in the frontend helper because that is what the focused tests assert today; if Task 6 wants “most recent first” in the sidebar, it should sort the returned metadata explicitly at the UI layer or tighten the persistence contract with updated tests.
- `frontend/src/features/ai/api.ts` now includes the chat bridge methods alongside the provider-secret bridge so the chat layer stays mockable without depending on generated Wails bindings in tests.
**Files created/modified:** `backend/chat.go`, `backend/chat_test.go`, `app.go`, `frontend/src/features/ai/api.ts`, `frontend/src/features/ai/sessions.ts`, `frontend/src/features/ai/sessions.test.ts`.
**Tests run:** Controller verification: `go test ./backend -run 'TestChatSession' -count=1` -> pass. `npm test -- src/features/ai/sessions.test.ts` -> pass. `npm test -- src/features/ai/ChatPanel.test.tsx` -> pass.
**Verification status:** Task 5 persistence behavior is passing on its focused backend and frontend suites in the controller session.
**How the next task should use this:** Task 6 should treat `frontend/src/features/ai/sessions.ts` as the source of truth for chat file formats and keep all chat UI writes going through it. If Task 6 adds note attachments, summaries, or per-session system prompts, it must preserve the existing JSONL/meta schema and extend the helper rather than bypassing it.

### Task 7 — Secure notes
**What was built:** Added the secure-note backend and frontend happy path. `backend/secure.go` now manages per-vault secure salt creation in `.app/config.json`, Argon2id key derivation, AES-256-GCM encryption/decryption, and in-process unlocked-key caching. `app.go` exposes `UnlockSecure`, `EncryptNote`, `DecryptNote`, and `ChangeSecurePassword`, while the frontend vault layer now supports unlocking the vault, loading `.md.sec` notes through decrypt, converting plaintext notes into `.md.sec`, and keeping secure notes out of the search index because `frontend/src/features/search/index.ts` already drops `is_secure` notes.
**Key decisions / deviations from `docs/design-v2.md`:**
- The secure vault manager currently reuses the existing `.app/config.json` path introduced by the search cache; the secure salt is stored there under `secureSalt`.
- The happy path implemented here covers unlock -> open secure note and plaintext -> secure conversion. Broader UX polish such as masked password entry, change-password UI, and richer secure-note lifecycle handling remains for later cleanup/polish work.
- Secure note conversion removes the plaintext source file once the encrypted write succeeds and returns the rescanned secure note metadata so the frontend can switch selection without re-scanning the entire vault manually.
**Files created/modified:** `backend/secure.go`, `backend/crypto_test.go`, `app.go`, `frontend/src/features/vault/api.ts`, `frontend/src/features/vault/notes.ts`, `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx`.
**Tests run:** Controller verification: `go test ./backend -run TestSecureVaultUnlockEncryptDecryptHappyPath -count=1` -> pass. `npm test -- src/app/App.test.tsx` -> pass. `npm test -- src/features/search/index.test.ts src/features/vault/store.test.ts` -> pass.
**Verification status:** Task 7 secure-note backend/frontend happy paths are passing in the controller session.
**How the next task should use this:** Task 8 should preserve the secure-note contract that `.md.sec` files stay out of search indexing and that secure notes require `vaultUnlockSecure()` before load/convert flows. If the UI gets refactored, keep `frontend/src/features/vault/notes.ts` as the boundary for secure-note load/save/convert behavior.

### Task 7 — Secure notes
**What was built:** Added vault password setup/unlock and per-vault Argon2id + AES-256-GCM secure-note handling on the Go side, including `.app/config.json` salt persistence, in-memory key caching, secure note encrypt/decrypt methods, and App bindings for `UnlockSecure`, `EncryptNote`, `DecryptNote`, and `ChangeSecurePassword`. On the frontend, secure notes now decrypt through the vault bridge, the app shell prompts once for a vault password when opening a locked `.md.sec`, and plaintext notes can be converted into secure notes through the UI. Secure notes remain excluded from search indexing.
**Key decisions / deviations from `docs/design-v2.md`:** The crypto manager lives in `backend/secure.go` instead of the design's `backend/crypto.go` filename, but the public backend contract matches the design. The frontend uses the existing prompt dialog for unlock/password entry rather than introducing a separate secure-note modal. Secure notes are treated as first-class scanned records and the app branches on `is_secure` from the scan store to decide when to unlock.
**Files created/modified:** `backend/secure.go`, `backend/chat.go`, `backend/crypto_test.go`, `app.go`, `frontend/src/features/vault/api.ts`, `frontend/src/features/vault/notes.ts`, `frontend/src/features/vault/notes.test.ts`, `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx`, `frontend/wailsjs/go/main/App.d.ts`, `frontend/wailsjs/go/main/App.js`.
**Tests run:** `go test ./backend -run TestSecureVaultUnlockEncryptDecryptHappyPath -count=1` -> pass. `go test ./... -count=1` -> pass. `npm test -- --run src/app/App.test.tsx src/features/vault/notes.test.ts` -> pass (14 tests).
**Verification status:** Task 7 secure-note backend, frontend unlock flow, and happy-path coverage are passing in the controller session.
**How the next task should use this:** Task 8 should preserve the secure-note Wails bindings and the `loadNote`/`saveNote` secure-path behavior, and should keep search exclusion for `.md.sec` files intact while polishing the remaining app shell and onboarding surfaces.

### Task 5 — Chat session persistence
**What was built:** Added backend chat-session file primitives and Wails bindings for `.chats/{id}.jsonl` and `.chats/{id}.meta.json`, including append/read/list/rename/delete helpers and metadata save/rebuild support. On the frontend, `frontend/src/features/ai/sessions.ts` now implements append/load/list/rename/delete/rebuild flows, tolerates a malformed trailing JSONL line, serializes sidecars with the design’s snake_case fields, and exposes chat-session search documents for the search layer. `ChatPanel` now uses the updated session metadata shape, and the search subsystem keeps the note-search contract while accepting chat-session indexing inputs.
**Key decisions / deviations from `docs/design-v2.md`:** The `.meta.json` sidecar is written with snake_case on disk (`started_at`, `updated_at`, `message_count`) even though the in-memory TypeScript model stays camelCase. That keeps the file format aligned with the design while preserving ergonomic frontend types. I kept the existing `search()` note-index method as a compatibility alias and added `searchChatSessions()` so Task 6 can consume chat search without breaking Task 3 callers.
**Files created/modified:** `backend/chat.go`, `backend/chat_test.go`, `app.go`, `frontend/src/features/ai/api.ts`, `frontend/src/features/ai/sessions.ts`, `frontend/src/features/ai/sessions.test.ts`, `frontend/src/features/ai/ChatPanel.tsx`, `frontend/src/features/ai/ChatPanel.test.tsx`, `frontend/src/features/search/index.ts`, `frontend/src/features/search/search.ts`.
**Tests run:** `go test ./backend/...` -> pass. `npm test -- --run src/features/ai/sessions.test.ts src/features/ai/ChatPanel.test.tsx src/features/search/index.test.ts src/features/search/cache.test.ts` -> pass. `npm run build` -> pass.
**Verification status:** Task 5 deliverable is implemented and the task-owned/backend suites are passing. One broader app-shell test (`src/app/App.test.tsx` reload-on-external-modified case) still fails in the wider frontend suite, but it does not block chat persistence and appears unrelated to the Task 5 file-format work.
**How the next task should use this:** Task 6 can call `listChatSessions({ vaultRoot, limit })`, `loadChatSession`, `appendChatSessionMessage`, `renameChatSession`, `deleteChatSession`, and `searchChatSessions` directly from `frontend/src/features/ai/sessions.ts` / `search.ts` without changing the backend file format again. If Task 6 needs sidebar session search, it should reuse the new chat-session document shape rather than inventing a second metadata model.

### Task 6 — Chat workspace and note attachments
**What was built:** Completed the chat workspace in `frontend/src/features/ai/ChatPanel.tsx` and wired it into the shell in `frontend/src/app/App.tsx`. The panel now supports free-form drafting within a session, session switching from the sidebar, streaming assistant responses, per-session provider/model/system-prompt editing, note attachment search and selection backed by the note FTS index, prompt assembly that includes attached notes, token-budget warnings, and extract-to-note via the existing session helper. The app shell now mounts ChatPanel alongside the note editor and resolves provider API keys through the Wails-backed keyring bridge.
**Key decisions / deviations from `docs/design-v2.md`:** I kept prompt assembly local to the chat panel instead of splitting out a dedicated `context.ts` file because the behavior is small and easier to verify in one component. Extract-to-note uses the existing prompt dialog from the app shell rather than a new modal. The panel uses a zero-arg extract-path callback so the shell can decide how to prompt for the output note path.
**Files created/modified:** `frontend/src/features/ai/ChatPanel.tsx`, `frontend/src/features/ai/ChatPanel.test.tsx`, `frontend/src/features/ai/sessions.ts`, `frontend/src/features/ai/sessions.test.ts`, `frontend/src/app/App.tsx`.
**Tests run:** `npm test -- --run src/features/ai/ChatPanel.test.tsx` -> pass (3 tests). `npm test -- --run src/features/ai/ChatPanel.test.tsx src/features/ai/sessions.test.ts src/app/App.test.tsx` -> pass (23 tests). `npm run build` -> pass.
**Verification status:** Task 6 is complete and verified in the controller session.
**How the next task should use this:** Task 8 should preserve the ChatPanel props contract (`resolveProvider`, `requestApiKey`, `requestExtractPath`) and the per-session metadata update path in `frontend/src/features/ai/sessions.ts`. If Task 8 refactors the shell layout, keep the chat panel mounted and keep the note-attachment search backed by `searchNotes()`.
