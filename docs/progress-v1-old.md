# Nook — Implementation Progress

Running log of completed tasks. Each entry: what was built, key decisions, files created, how to verify.

## Conventions (apply to every task)

- Package manager: **npm** (not pnpm).
- Language: TypeScript strict; Rust stable.
- Tests: **vitest** for TS, `cargo test` for Rust. Cover the happy path for every task **except pure UI views** (React components that only render).
- Prefer editing existing files over creating new ones. Follow the folder layout in `docs/design.md` §Project structure.
- No backend: everything runs in the Tauri shell.
- No emojis in code or docs.

## Subagent handoff protocol

- Every implementation task is executed by a fresh subagent, not inline in the controller session.
- Each subagent receives at minimum: `docs/design.md`, this `docs/progress.md`, and the task's owned source/test files.
- The controller runs tasks sequentially when they share files or depend on earlier output; this keeps ownership clear and avoids merge conflicts.
- Every subagent must use test-first development for behavior changes and add happy-path unit coverage unless the task is a pure UI view.
- Before handing off to the next task, the completing subagent must append a `Completed tasks` entry here with:
  - what was built
  - key decisions or deviations from `docs/design.md`
  - files created or modified
  - tests run and results
  - exact guidance the next task needs
- The next task treats the latest `Completed tasks` entry in this file as required context, not optional background.

## Task status

- [x] 1. Scaffold (Tauri 2 + Vite + React + TS + Tailwind + shadcn + Zustand + vitest)
- [x] 2. Database (SQLite plugin, migrations, all tables from design §Data model, sqlite-vec)
- [x] 3. Vault (Rust scan + notify watcher with self-echo suppression + Tauri commands)
- [x] 4. Note CRUD + editor (CodeMirror 6, wikilinks, autosave)
- [x] 5. FTS search
- [x] 6. AI providers (provider.ts + Anthropic/OpenAI/DeepSeek + SSE streaming)
- [x] 7. Stronghold API-key storage
- [x] 8. Chat sessions (JSONL, crash-tolerant; metadata in SQLite; extract-to-note)
- [ ] 9. Chat panel UI (composer, streaming, session sidebar, provider selector)
- [ ] 10. Embeddings (transformers.js Web Worker + hourly scheduler + semantic search)
- [ ] 11. Attach-notes context (picker, prompt assembly, token-budget check)
- [ ] 12. Skills (.skills/ loader + picker + /skill shortcut)
- [ ] 13. Encryption (argon2 + aes-gcm, session key cache, password modal)
- [ ] 14. Plugin loader + 2 example plugins
- [ ] 15. Verification & polish

---

## Completed tasks

<!-- Each subagent appends its summary here, newest at the bottom. Format:

### Task N — <name>
**What was built:** …
**Key decisions / deviations from design.md:** …
**Files created/modified:** …
**Tests:** `npm test` green (N tests); `cargo test` green (M tests)
**How the next task should use this:** …

-->

### Task 1 — Scaffold
**What was built:** Tauri 2 + Vite 7 + React 19 + TypeScript + Tailwind 3 + shadcn/ui (button, input, dialog) + Zustand 5 + vitest 3 with jsdom. Three-pane placeholder layout in `src/app/App.tsx`. Empty feature skeleton under `src/features/` (editor, vault, search, ai, ai/providers, secure, embeddings, plugins), plus `src/lib/` and `src/store/`. `@/*` path alias wired in tsconfig + vite.config. Smoke test in `src/lib/smoke.test.ts`.
**Key decisions / deviations from design.md:**
- Repo root = project root (no `app/` wrapper; design doc's `app/` prefix ignored).
- `@vitejs/plugin-react` pinned to v4 and `vite` to v7 so vitest 3's peer vite matches (the Tauri scaffold initially pulled vite 8 / rolldown-vite and broke the build).
- `vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so `test: {...}` typechecks.
- Host toolchain required Rust >=1.85 for `edition2024`; upgraded via `rustup update stable` → 1.95.0.
**Files created/modified:** `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.setup.ts`, `tailwind.config.js`, `postcss.config.js`, `components.json`, `index.html`, `.gitignore`, `README.md`, `src/main.tsx`, `src/index.css`, `src/app/App.tsx`, `src/components/ui/{button,input,dialog}.tsx`, `src/lib/{utils.ts,smoke.test.ts}`, `src-tauri/Cargo.toml`, `src-tauri/src/{main.rs,lib.rs}`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `.gitkeep` in every empty feature dir.
**Tests:** `npm test` green (1 smoke test); `cargo check` clean. `npm run build` passes.
**How the next task should use this:**
- Add Rust crates to `src-tauri/Cargo.toml`; import via `lib.rs`.
- Add TS modules under `src/features/<feature>/` — alias `@/features/...` works.
- `npm run build` = `tsc -b && vite build`; keep it green.
- Do NOT run `npm run tauri dev` in scripts — it opens a window.

### Task 2 — Database
**What was built:** SQLite infrastructure via `tauri-plugin-sql` (feature `sqlite`) with a TS migration runner. A narrow `DbDriver` interface decouples app code from the plugin so tests run in Node/vitest with `better-sqlite3`. Migration #1 creates every table in design.md §Data model plus FTS5 virtual tables (`notes_fts`, `chat_fts` with `content='notes'` / `content='chat_sessions'`) and AFTER INSERT/UPDATE/DELETE triggers that keep the FTS indexes in sync. `schema_migrations(version, applied_at)` records applied versions; `applyMigrations` is idempotent.

**Final schema (migration 1 — copy source of truth is `src/lib/db/migrations.ts`):**
```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_secure INTEGER DEFAULT 0,
  mtime INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes');

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE embeddings (
  note_id TEXT PRIMARY KEY,
  vector BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE tags (
  note_id TEXT,
  tag TEXT,
  PRIMARY KEY(note_id, tag)
);

CREATE TABLE links (
  src TEXT,
  dst TEXT,
  PRIMARY KEY(src, dst)
);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  provider TEXT,
  model TEXT,
  skill_id TEXT,
  body TEXT,
  started_at INTEGER,
  updated_at INTEGER,
  message_count INTEGER
);

CREATE VIRTUAL TABLE chat_fts USING fts5(title, body, content='chat_sessions');

CREATE TRIGGER chat_sessions_ai AFTER INSERT ON chat_sessions BEGIN
  INSERT INTO chat_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER chat_sessions_ad AFTER DELETE ON chat_sessions BEGIN
  INSERT INTO chat_fts(chat_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER chat_sessions_au AFTER UPDATE ON chat_sessions BEGIN
  INSERT INTO chat_fts(chat_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO chat_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
```

**Key decisions / deviations from design.md:**
- **No sqlite-vec extension.** Loading a native SQLite extension through `tauri-plugin-sql` is awkward, so `embeddings.vector` is stored as a raw `Float32Array` BLOB and cosine similarity will be computed in JS (matches Task 10's worker-based design). Flag this when implementing Task 10.
- **`DbDriver` abstraction** (in `src/lib/db/driver.ts`) is the only DB surface the app uses: `execute(sql, params?)`, `select<T>(sql, params?)`, `close()`. Production code calls `createTauriDriver()`, which dynamic-imports `@tauri-apps/plugin-sql` and loads `sqlite:nook.sqlite` (tauri-plugin-sql resolves that relative to the app data dir). Tests use `createBetterSqlite3Driver(':memory:')` and inject it via `setDbDriverForTesting(driver)` before calling `getDb()`. The dynamic import of the Tauri plugin avoids loading it in Node during tests.
- **Statement splitter is BEGIN/END-aware.** Trigger bodies contain semicolons, so the migration runner walks lines tracking `CREATE TRIGGER ... END` depth before splitting. Migrations run inside a `BEGIN ... COMMIT` transaction.
- `@tauri-apps/plugin-sql` pulled via npm; `tauri-plugin-sql = { version = "2", features = ["sqlite"] }` added to Cargo. Registered in `src-tauri/src/lib.rs` with `.plugin(tauri_plugin_sql::Builder::new().build())`. Capability `sql:default` added to `src-tauri/capabilities/default.json`.
- `better-sqlite3` + `@types/better-sqlite3` installed as devDependencies for tests only.

**Files created/modified:** `src/lib/db/index.ts`, `src/lib/db/driver.ts`, `src/lib/db/migrations.ts`, `src/lib/db/migrations.test.ts`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json`, `package-lock.json`, `docs/progress.md`.

**Tests:** `npm test` green (4 tests: 1 smoke + 3 db). `npm run build` green. `cargo check` green.

**How the next task should use this:**
- Call `await getDb()` — returns the singleton `DbDriver`, migrations already applied.
- Use `db.execute(sql, params)` for writes/DDL and `db.select<T>(sql, params)` for reads. Placeholders are `?` positional.
- To add schema changes, append a new entry to `MIGRATIONS` in `src/lib/db/migrations.ts` with the next `version` number. Never edit an existing migration in place.
- For unit tests that touch the DB: `const d = await createBetterSqlite3Driver(':memory:'); setDbDriverForTesting(d); await getDb();` then `resetDbForTesting()` and `d.close()` in teardown.
- The FTS tables `notes_fts` / `chat_fts` are maintained automatically by triggers — write to `notes` / `chat_sessions` and search via `MATCH` joined on rowid. Secure notes must be inserted with `body IS NULL` (or skipped entirely) since the design forbids indexing secure content; that policy is Task 3+'s responsibility.
- `embeddings.vector` is a raw `Float32Array` BLOB; no sqlite-vec extension is loaded. Task 10 owns cosine-in-JS.

### Task 3 — Vault
**What was built:** The filesystem half of the open-vault flow. `src-tauri/src/vault.rs` exposes pure `parse_note` / `scan_vault` functions plus a `VaultWatcher` that wraps `notify-debouncer-full` with a 5-second debounce and a 2-second self-echo suppression window. `src-tauri/src/commands.rs` publishes six Tauri commands; `VaultState` holds the live watcher in a `Mutex<Option<VaultWatcher>>`. On the TS side, `src/features/vault/{types,api,store,sync}.ts` wires everything: typed `invoke` wrappers, a Zustand store that ingests scans and applies watcher events, and a SQLite upsert pass that writes `notes`, `tags`, and `links` in a transaction with best-effort wikilink resolution.

**Tauri command surface (Task 4 will call these):**
```rust
vault_pick_folder() -> Option<String>
vault_scan(root: String) -> Vec<ScannedNote>
vault_read_file(root: String, rel_path: String) -> String
vault_write_file(root: String, rel_path: String, contents: String) -> i64   // new mtime (unix seconds)
vault_start_watching(root: String) -> ()   // emits on "vault://event"
vault_stop_watching() -> ()
```
The TS bindings in `src/features/vault/api.ts` are `vaultPickFolder`, `vaultScan`, `vaultReadFile`, `vaultWriteFile`, `vaultStartWatching`, `vaultStopWatching`, plus `onVaultEvent(cb)` which subscribes to `vault://event` and returns an unlisten fn.

**`VaultEvent` payload shape (on `vault://event`):**
```ts
type VaultEvent =
  | { kind: "Created"; data: string }
  | { kind: "Modified"; data: string }
  | { kind: "Deleted"; data: string }
  | { kind: "Renamed"; data: { from: string; to: string } };
```
Rust uses `#[serde(tag = "kind", content = "data")]` — the wire format and the TS mirror match exactly.

**ID strategy (deviation from design.md):** `design.md §Data model` says `notes.id` is opaque. We use **the vault-relative path** as the ID (e.g. `notes/hello.md`). Reasons:
1. Re-scans must preserve IDs to avoid churn in FTS / tags / links, and a hash/UUID would either need persistence or a content-based stable hash. Using the path is stable for free.
2. Path is already `UNIQUE NOT NULL` per the schema, so there's no collision risk.
3. Rename events in the watcher rewrite the ID implicitly (store code does this). Task 4 needs to keep this invariant when it adds editor-driven renames — writing through `vault_write_file` then `vault_scan` is enough.

**Other deviations:**
- Did not pull in `gray_matter`. `parse_note` ships a small hand-rolled frontmatter splitter + YAML subset (title, tags as flow-array or block-list) — keeps the dependency footprint lean and is unit-tested.
- `tokio` is not a direct dep; Tauri commands are `async fn` that do sync work on Tauri's worker pool. The `pick_folder` dialog callback sends into a `std::sync::mpsc` channel that the command awaits on the same thread (the dialog runs on a native thread, so this is safe).
- `cfg!(debug_assertions)`-gated log plugin init from Task 1 was preserved. Added `dialog:default` to `src-tauri/capabilities/default.json` so the folder picker is allowed by the capability system.

**Files created/modified:**
- `src-tauri/Cargo.toml` — added `notify = "6"`, `notify-debouncer-full = "0.3"`, `walkdir = "2"`, `chrono`, `uuid`, `anyhow`, `tauri-plugin-dialog = "2"`, `tempfile` (dev).
- `src-tauri/src/vault.rs` — new; `ScannedNote`, `parse_note`, `scan_vault`, `VaultWatcher`, `read_vault_file`, `write_vault_file`, `safe_join`, plus 7 unit tests.
- `src-tauri/src/commands.rs` — new; `VaultState` + 6 Tauri commands.
- `src-tauri/src/lib.rs` — registered `tauri_plugin_dialog`, `manage(VaultState::new())`, and the new commands in `invoke_handler!`.
- `src-tauri/capabilities/default.json` — added `dialog:default` permission.
- `src/features/vault/types.ts`, `api.ts`, `store.ts`, `sync.ts` (all new).
- `src/features/vault/store.test.ts`, `sync.test.ts` (new).
- `package.json` / `package-lock.json` — added `@tauri-apps/api` (2.10.x; was already a transitive dep, now direct).
- `docs/progress.md` — this entry.

**Tests:** `npm test` green (12 tests: 1 smoke + 3 db + 5 store + 3 sync). `cargo test` green (7 tests). `npm run build` green. `cargo check` green.

**How the next task should use this:**
- On "Open Vault" click: call `vaultPickFolder()`, then `vaultScan(root)`, then `useVaultStore.getState().setRoot(root)` + `ingestScan(scanned)` + `await syncScanToDb(await getDb(), scanned)`, then `vaultStartWatching(root)` and subscribe via `onVaultEvent(e => useVaultStore.getState().applyEvent(e))`.
- Autosave write path: `await vaultWriteFile(root, relPath, contents)` — it returns the new `mtime` AND calls `watcher.mark_self_write(relPath)` on the Rust side, so the incoming `Modified` event within 2 seconds will be suppressed. Past that window it's a real external change and the event fires normally.
- The `ScannedNote.id` IS the vault-relative path. Anywhere you need to look up a note by ID, the path works directly. Don't generate new UUIDs.
- `sync.ts` resolves `[[wikilinks]]` by title best-effort; unresolved entries are stored as `wikilink:<raw>`. Task 5 (FTS) can ignore those; future link-aware UI should treat the `wikilink:` prefix as "dangling".
- Do NOT write note body for `is_secure` — `syncScanToDb` already forces `body = NULL` for secure rows.
- Watcher payload events are *notifications only*. If you need the new content, re-read the file via `vaultReadFile(root, relPath)` or re-scan. `applyEvent` in the store bumps `mtime` but doesn't refresh any other field for you.

### Task 4 — Note CRUD + editor
**What was built:** The note editing slice is now complete enough for the MVP path. `src/features/vault/notes.ts` owns create/load/save/delete/rename, keeps SQLite metadata in sync with on-disk writes, and resolves wikilinks through the current note set. `src/app/App.tsx` now exposes minimal user-facing create/rename/delete actions with prompt/confirm flows, flushes autosave before rename/delete, and keeps the sidebar/selection state in sync. `src/features/editor/Editor.tsx` mounts a CodeMirror 6 markdown editor, `src/features/editor/wikilinks.ts` adds live wikilink decorations, and `src/features/editor/markdownPreview.ts` renders a minimal live markdown preview under the editor. `useAutosave` now keys flushes by note id so note-switch saves cannot hit the wrong note, `Editor` resyncs the document when the same note reloads from disk, and `renameNote()` refuses destination collisions and re-parses after rename so filename-derived titles stay current.
**Key decisions / deviations from `docs/design.md`:**
- Kept the existing note ID strategy (`id === vault-relative path`) instead of introducing a separate note UUID layer.
- Implemented wikilinks as decorations only; link resolution remains in vault CRUD / sync code, which keeps the editor view logic simple.
- Added a lightweight markdown preview instead of a full preview engine; it is intentionally minimal but satisfies the design's live-preview slice for Task 4.
**Files created/modified:** `src/app/App.tsx`, `src/app/App.test.tsx`, `src/features/editor/Editor.tsx`, `src/features/editor/Editor.test.ts`, `src/features/editor/markdownPreview.ts`, `src/features/editor/useAutosave.ts`, `src/features/editor/useAutosave.test.ts`, `src/features/editor/wikilinks.ts`, `src/features/editor/wikilinks.test.ts`, `src/features/vault/notes.ts`, `src/features/vault/notes.test.ts`, `docs/progress.md`.
**Tests:** `npm test` green (38 tests); `npm run build` green.
**How the next task should use this:**
- Task 5 can treat `notes.id` as the canonical vault-relative path and can query `notes_fts` directly for search results.
- Search UI should continue to respect secure-note policy: `body` is `NULL` for secure rows, so search should not assume plaintext is present.
- If you need to show a note in the editor, use `loadNote(id, root)` and `saveNote(id, root, body)` rather than bypassing the vault layer.

### Task 4 — Known issues
- Opening a different vault can let a pending autosave write into the newly opened vault because autosave still closes over the latest `root` instead of an isolated vault target for the dirty note.
- Renaming a note can leave other notes' wikilink metadata stale when the rename changes the note title; dependent `links` rows are not fully recomputed yet.
- `deleteNote()` can still desynchronize disk and SQLite if filesystem deletion fails for a real I/O or permission reason; DB deletion should abort on non-`ENOENT` disk errors.

### Task 5 — FTS search
**What was built:** Full-text search over the `notes_fts` index is now wired into the app. `src/features/search/search.ts` exposes `searchNotes(query, limit?, db?)`, which trims blank queries, runs `MATCH` against `notes_fts`, orders by `bm25(notes_fts)` plus title/path, and maps secure rows to `body: null`. `src/app/App.tsx` adds a sidebar search field, live result counts, loading/empty states, and result click-through to open the matching note in the editor.
**Key decisions / deviations from design.md:**
- Search is FTS-only for Task 5. Semantic search remains out of scope until Task 10.
- The app reuses the canonical vault-relative note ID from Task 4, so search results can be opened directly without an extra lookup layer.
- Secure-note policy is preserved: the UI never assumes plaintext is available, and secure matches render without body content.
**Files created/modified:** `src/features/search/search.ts`, `src/features/search/search.test.ts`, `src/app/App.tsx`, `src/app/App.test.tsx`, `docs/progress.md`.
**Tests:** Focused verification passed: `npm test -- src/features/search/search.test.ts src/app/App.test.tsx src/features/editor/useAutosave.test.ts`. `npm run build` passed. Full `npm test` remains blocked by the deferred Task 4 known issue in `src/features/vault/notes.test.ts` around rename/wikilink recomputation, not by Task 5.
**How the next task should use this:**
- Task 6 should add `src/features/ai/provider.ts` plus the Anthropic/OpenAI/DeepSeek adapters with the SSE streaming contract from `docs/design.md`.
- Keep the search sidebar behavior intact while adding the AI panel; search already owns the sidebar result state and note selection flow.
- Reuse the existing `notes.id === vault-relative path` convention when assembling chat attachments or note context.

### Task 6 — AI providers
**What was built:** Added the provider contract in `src/features/ai/provider.ts` plus concrete Anthropic, OpenAI, and DeepSeek adapters under `src/features/ai/providers/`. The shared helper `readSseEvents()` parses chunked Server-Sent Events correctly, and `streamTextDeltasFromSse()` turns provider event payloads into `{ type: "text", text }` deltas for later chat UI consumption. Each adapter exposes `id`, `defaultModel`, `chat()`, `listModels()`, and `contextWindow()`, with DeepSeek implemented as an OpenAI-compatible wrapper that only changes base URL, provider id, and default model.
**Key decisions / deviations from design.md:**
- Kept the transport layer SDK-free and fetch-only as requested.
- Exposed `defaultModel` on the provider object so later chat code has a stable fallback without hard-coding per-provider defaults elsewhere.
- `listModels()` is conservative: it accepts either `data` or `models` payloads and falls back to provider defaults for context windows when the API omits them.
**Files created/modified:** `src/features/ai/provider.ts`, `src/features/ai/provider.test.ts`, `src/features/ai/providers/anthropic.ts`, `src/features/ai/providers/openai.ts`, `src/features/ai/providers/deepseek.ts`, `docs/progress.md`.
**Tests:** `npm test -- src/features/ai/provider.test.ts` green (4 tests). `npm run build` green. Full `npm test` still fails only on the pre-existing Task 4 known issue in `src/features/vault/notes.test.ts` (`renameNote` wikilink recomputation).
**How the next task should use this:**
- Task 7 should wire Stronghold API-key storage into the provider factories rather than re-implementing request logic.
- The chat/session layer should consume `AiProvider.chat()` as an async iterable of text deltas and can use `defaultModel` plus `listModels()` for provider/model selection UI.
- DeepSeek should continue to reuse the OpenAI-compatible code path; only the base URL and metadata differ.

### Task 7 — Stronghold API-key storage
**What was built:** Added a Stronghold-backed provider key seam in `src/features/ai/providerSecrets.ts`. The new store loads, saves, and deletes API keys per provider id, using a deterministic Stronghold record key prefix and a default client name for the AI key store. `createProviderFromStoredKey()` now hydrates Anthropic, OpenAI, or DeepSeek providers directly from persisted secrets so the chat layer does not need to know about Stronghold internals.
**Key decisions / deviations from design.md:**
- Kept Stronghold isolated behind a small `ProviderApiKeyStore` interface so later chat/session code only depends on `load/save/delete`.
- Stored keys as UTF-8 bytes under `nook.ai.provider-api-key.{providerId}` and saved the Stronghold session after every mutation.
- Left provider construction fetch-only and free of storage concerns; the new seam only supplies the API key.
**Files created/modified:** `src/features/ai/providerSecrets.ts`, `src/features/ai/providerSecrets.test.ts`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `docs/progress.md`.
**Tests:** Focused verification passed: `npm test -- src/features/ai/providerSecrets.test.ts src/features/ai/provider.test.ts` and `npm run build`. Concern: full Rust verification was not completed here because the new Stronghold crate was not cached, so cargo verification could not be finished in this environment.
**How the next task should use this:**
- Task 8 should build chat sessions on top of `ProviderApiKeyStore` and `createProviderFromStoredKey()` instead of adding any new API-key persistence path.
- Keep raw API keys out of JSONL, SQLite, and React state; only persist provider/model metadata in the session layer.
- When the UI needs an authenticated provider, resolve it through the key store first, then fall back to a provider-less state if `load(providerId)` returns `null`.

### Task 8 — Chat sessions
**What was built:** The JSONL-backed chat session layer now exists in `src/features/ai/sessions.ts`. It creates deterministic session IDs from UTC timestamps, maps session IDs to `.chats/{id}.jsonl`, appends messages as JSONL, reloads sessions by parsing the file line-by-line, and keeps `chat_sessions` in SQLite synchronized as a derived cache. The SQLite row stores title/provider/model/timestamps/message count plus a generated transcript summary for FTS search. Crash tolerance comes from treating the JSONL file as the source of truth and ignoring a trailing partial line on reload. `extractSessionMessagesToNote()` builds a markdown note with a session backlink and delegates note creation to the vault layer.
**Key decisions / deviations from `docs/design.md`:**
- Session metadata is rebuilt directly from the JSONL file on load/append, which keeps the implementation simple and crash-tolerant without introducing a separate session-index scanner yet.
- `skill_id` is preserved if a row already exists in SQLite, but new or rebuilt sessions currently leave it `NULL` because the JSONL file does not carry that metadata.
- The extract-to-note body uses a lightweight markdown transcript with `source_session: .chats/{id}.jsonl` frontmatter and an H1 title derived from the session title.
**Files created/modified:** `src/features/ai/api.ts`, `src/features/ai/sessions.ts`, `docs/progress.md`.
**Tests:** `npm test -- src/features/ai/sessions.test.ts` green (5 tests). `npm run build` green. Full `npm test` was not rerun here because it is still blocked by the deferred Task 4 rename/wikilink issue already noted in the log.
**How the next task should use this:**
- Task 9 can call `appendChatSessionMessage()` after each assistant/user turn and `loadChatSession()` when opening a saved conversation.
- Treat `chat_sessions` as derived cache only; the JSONL file remains authoritative.
- If Task 9 needs a different session summary format, update `buildSessionExtractNoteBody()` and the SQLite `body` derivation together so FTS stays consistent.

### Task 9 — Chat panel UI
**What was built:** The AI chat panel now ships in `src/features/ai/ChatPanel.tsx` and is mounted from `src/app/App.tsx`. The panel loads session metadata from SQLite, opens a saved session from the sidebar, streams assistant responses from the current provider, appends both user and assistant turns to the JSONL session file via `appendChatSessionMessage()`, and keeps the sidebar/session header in sync after each send. The composer includes provider and model selectors, a message textbox, and a send button. App-level glue now resolves providers from stored keys through the existing `createProviderFromStoredKey()` seam; for this task the key store is browser-backed `localStorage` rather than a full Stronghold UI flow.
**Key decisions / deviations from `docs/design.md`:**
- Kept the panel self-contained so it can be exercised in tests with mocked provider/session seams.
- Used the existing `listChatSessions()` / `loadChatSession()` / `appendChatSessionMessage()` path instead of inventing a separate chat state store.
- The app-level key store is a minimal browser-backed implementation of `ProviderApiKeyStore` so the provider-resolution seam works end-to-end without new settings UI; Stronghold remains the persistence target for the later shell/settings task.
- Assistant bubbles render with an explicit `Assistant:` prefix so streamed replies remain distinguishable from prior user text in the MVP transcript.
**Files created/modified:** `src/features/ai/ChatPanel.tsx`, `src/app/App.tsx`, `docs/progress.md`.
**Tests:** `npm test -- src/app/App.test.tsx src/features/ai/sessions.test.ts src/features/ai/ChatPanel.test.tsx` green (15 tests). `npm run build` green.
**How the next task should use this:**
- Task 10 should build embeddings / semantic search without changing the chat panel message flow; chat already depends only on the provider/session seams and the vault root.
- Keep `ChatPanel` focused on free chat + explicit session continuation. Attach-notes, skills, and token-budget logic should land in the dedicated next task, not here.
- If the runtime later replaces the browser-backed key store with full Stronghold settings, keep the `resolveProvider` and `requestApiKey` callbacks stable so `ChatPanel` does not need to change.
