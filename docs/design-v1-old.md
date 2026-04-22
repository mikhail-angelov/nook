# Nook — Implementation Plan

## Context

**Nook** is a local-first knowledge and AI-chat app — a small, private corner for your notes and conversations with AI. Everything lives on the user's disk: notes as markdown files, chats as JSONL, settings as JSON. No backend, no account, no telemetry. Users sync across devices by pointing Google Drive / Yandex Disk / iCloud / Dropbox at the vault folder — the app doesn't care which.

Two overlapping use cases the app has to serve equally well:

1. **Knowledge base** — write and search notes, import existing markdown, ask an AI assistant questions grounded in your notes.
2. **General AI chat client** — chat with Claude, OpenAI, or DeepSeek using your own API key, with optional note-attachment for context, reusable "skills" (prompt configurations), and full session history.

Differentiators versus existing tools:
- **Per-note encryption** — mark a note as secure, encrypted with AES-GCM on disk, decrypted only after the user enters the password in the current session.
- **Multi-provider AI** — Claude, OpenAI, DeepSeek out of the box, pluggable for more.
- **Skills** — user-defined prompt/model configurations, shareable as files.
- **Chat sessions archived as JSONL** — resumable, searchable, and trivially exportable. Anything valuable can be extracted to a note with one click.
- **Obsidian-style plugins** — third-party JS plugins extend the app.

## Stack

- **Shell**: Tauri 2 (Rust backend; small, fast, signed installers)
- **Frontend**: React + Vite + TypeScript
- **Editor**: CodeMirror 6 with markdown language + live decorations (same family Obsidian uses)
- **Database**: SQLite via `tauri-plugin-sql` with FTS5 for search; `sqlite-vec` for embeddings
- **Embeddings**: `@xenova/transformers` running `all-MiniLM-L6-v2` in a Web Worker
- **Encryption**: Rust — `argon2` (key derivation) + `aes-gcm` (authenticated encryption), exposed via Tauri commands
- **Secret storage**: `tauri-plugin-stronghold` for API keys (encrypted store keyed off OS keychain)
- **State**: Zustand
- **UI**: Tailwind + shadcn/ui

## Vault layout on disk

```
my-vault/
├── notes/…                      # plain .md / .txt files (or .md.sec for secure)
├── .chats/
│   └── 2026-04-20-abc123.jsonl  # one file per session
├── .skills/
│   └── translate-ru/
│       └── SKILL.md             # frontmatter + system prompt
├── .plugins/
│   └── word-count/
│       ├── manifest.json
│       └── main.js
└── .app/
    ├── index.sqlite             # derived cache (safe to delete)
    └── config.json
```

Everything except `.app/` is portable — sync the folder, the app rebuilds its index.

## MVP scope

**In:**

1. Open-vault flow: pick a folder, scan it, populate SQLite index.
2. Markdown editor (CodeMirror) with `[[wikilinks]]` (resolved by title; ambiguous titles disambiguated by path), `#inline-tags` plus YAML-frontmatter `tags:` array, live preview.
3. **Autosave** — debounced 2s after keystrokes + on editor blur + on window hide. Never on every keystroke.
4. Import: recursive scan of `.md` / `.txt` on open + on-demand re-scan.
5. External file watcher — for files changed by sync clients. Debounce 5s. Only reindex metadata + FTS; not embeddings (see below).
6. **Scheduled embedding refresh** — background job every hour: find notes where `notes.mtime > embeddings.updated_at`, regenerate in batch in the Web Worker. Also run once on vault open if cold.
7. Full-text search (FTS5) + semantic search (vector cosine over note embeddings). Both feed the sidebar search UI and the "attach notes" picker in chat — semantic results help the user find what to attach. There is no automatic retrieval-augmented chat; context is always opt-in.
8. AI chat panel that works in **two modes**:
   - **Free chat** — just talk to the model, no retrieval.
   - **With context** — user explicitly attaches notes (pick from a list, or the current note) which are included in the system prompt.
9. Provider selector: Anthropic / OpenAI / DeepSeek. API keys in Stronghold. DeepSeek uses OpenAI-compatible adapter with different base URL.
10. **Skills** — reusable configurations. A skill is a folder in `.skills/{id}/` with `SKILL.md` (frontmatter: `name`, `description`, `model`, `provider`, optional `attachNotes` array of vault-relative paths; body = system prompt). Selected in chat via a dropdown or `/skill-name`. Paths (not internal IDs) keep skills portable when shared across vaults.
11. **Chat sessions as JSONL** — each session is one file in `.chats/`. Each line is a message object `{role, content, ts, provider, model, attachments?}`. Session metadata (`title`, provider/model defaults, skill, timestamps, message count, search summary) lives in SQLite, not in the JSONL file. Sidebar lists past sessions; user can open any to continue, rename, delete, or export. Search across sessions via FTS.
12. **Extract to note** — from a chat, user highlights a message (or selects "summarize session"), hits "Save as note" → creates a markdown note in a configurable folder, with a frontmatter backlink to the session file.
13. Per-note "secure" flag — AES-GCM encryption, `.md.sec` extension, password prompt on first access each app session. Secure note plaintext is never stored in SQLite, never added to FTS, and never embedded.
14. Plugin loader — load JS from `.plugins/*/main.js`, pass an `App` API.

**Out (phase 2):**

- Knowledge graph view
- Mobile
- Local LLM (Ollama bridge)
- Live multi-device sync (folder sync handles it)

## Project structure

```
app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── crypto.rs            # argon2 + aes-gcm commands
│   │   ├── vault.rs              # scan + notify-based watcher
│   │   ├── db.rs                 # SQLite init / migrations
│   │   └── commands.rs
│   └── Cargo.toml
├── src/
│   ├── app/App.tsx
│   ├── features/
│   │   ├── editor/               # CodeMirror, autosave, wikilinks
│   │   ├── vault/                # import, watcher bridge, note CRUD
│   │   ├── search/
│   │   ├── ai/
│   │   │   ├── providers/        # anthropic.ts | openai.ts | deepseek.ts
│   │   │   ├── provider.ts       # common interface
│   │   │   ├── context.ts        # attached-note context + prompt assembly
│   │   │   ├── sessions.ts       # JSONL read/write, resume, extract-to-note
│   │   │   ├── skills.ts         # .skills/ loader + frontmatter parse
│   │   │   └── ChatPanel.tsx
│   │   ├── secure/               # password modal + session key store
│   │   ├── embeddings/
│   │   │   ├── scheduler.ts      # hourly refresh job
│   │   │   └── worker.ts         # transformers.js host
│   │   └── plugins/              # loader + App API
│   ├── lib/db.ts
│   └── store/
└── package.json
```

## Data model (SQLite)

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT,                        -- populated only for non-secure notes; secure notes stay NULL
  is_secure INTEGER DEFAULT 0,
  mtime INTEGER NOT NULL,           -- filesystem mtime of the source file
  created_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes');

CREATE TABLE embeddings (
  note_id TEXT PRIMARY KEY,
  vector BLOB NOT NULL,
  updated_at INTEGER NOT NULL       -- compared to notes.mtime by scheduler
);

CREATE TABLE tags  (note_id TEXT, tag TEXT, PRIMARY KEY(note_id, tag));
CREATE TABLE links (src TEXT, dst TEXT, PRIMARY KEY(src, dst));

-- Chat sessions are the source-of-truth files; this table is derived index.
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,              -- matches .chats/{id}.jsonl filename
  title TEXT,
  provider TEXT,
  model TEXT,
  skill_id TEXT,
  body TEXT,                        -- AI-generated session summary for FTS/search snippets
  started_at INTEGER,
  updated_at INTEGER,
  message_count INTEGER
);
CREATE VIRTUAL TABLE chat_fts USING fts5(title, body, content='chat_sessions');
```

## Key subsystems

### Autosave
- Editor emits `change` events at keystroke rate; a 2s debounce per note triggers a write to disk.
- Blur + window hide + app quit flush immediately.
- SQLite row updated inline with the disk write (same transaction-ish flow via Tauri command).
- **No reactive embedding regeneration** — the scheduler handles it.

### File watcher (external changes)
- Rust `notify` crate watches the vault. Debounce 5s per path.
- Ignore writes we just made ourselves (tag recent-write paths for 2s, suppress the echo). Heuristic — a sync client writing within the same window will also be suppressed; acceptable trade-off for MVP.
- On external change: re-parse file, update `notes` row + FTS for non-secure notes. For secure notes, update only metadata (`path`, `title`, `is_secure`, `mtime`) and skip FTS + embeddings entirely.

### Embedding scheduler
- Interval timer: every 60 minutes, run `SELECT notes.id FROM notes LEFT JOIN embeddings ON … WHERE notes.is_secure = 0 AND (embeddings.updated_at IS NULL OR notes.mtime > embeddings.updated_at)`.
- Batch into groups of ~16, send to embeddings Web Worker, write results in a single transaction.
- Also triggered on vault open (if any are missing) and manually via "Rebuild embeddings" command. Secure notes are always excluded.

### AI provider abstraction

```ts
interface AiProvider {
  id: 'anthropic' | 'openai' | 'deepseek';
  chat(messages: Msg[], opts: {model, stream, system?}): AsyncIterable<Delta>;
  listModels(): Promise<Model[]>;
  contextWindow(model: string): number;          // tokens; powers the attach-notes budget check
  embed?(texts: string[]): Promise<number[][]>;  // optional, used by semantic search
}
```

- Each adapter is a minimal `fetch` wrapper, no SDKs (keeps bundle small, avoids version drift).
- DeepSeek extends OpenAI adapter with a different `baseUrl` and default model.
- Streaming via Server-Sent Events, yielded as text deltas for the UI.

### Skills
- A skill file (`.skills/{id}/SKILL.md`):
  ```markdown
  ---
  name: Translate to Russian
  description: Translate incoming messages into fluent Russian
  provider: anthropic
  model: claude-sonnet-4-6
  attachNotes:                 # optional: vault-relative paths, portable across vaults
    - reference/russian-style-guide.md
  ---
  You are an expert Russian translator. …
  ```
- Loaded at startup from `.skills/`; changes hot-reload via the file watcher.
- Chat UI: skill picker in the composer, or type `/skill-id` to switch for one message.

### Chat sessions (JSONL)
- Each session = one file `.chats/{YYYY-MM-DD-HHMMSS}-{shortid}.jsonl`.
- Every line is a message object: `{role, content, ts, provider, model, attachments?}`.
- `sessions.ts` reads/appends lines; the SQLite `chat_sessions` table is a derived cache rebuilt on startup (and incrementally on append).
- Session metadata is stored only in SQLite. `chat_sessions.body` is a generated summary of the session used for FTS and search snippets; it is not written back into the JSONL file.
- "Continue session" opens the JSONL, replays messages into the UI, appends from there.
- "Extract to note" takes selected messages (or runs a summary via the current provider) and writes a new `.md` in the user's chosen notes folder with frontmatter `source_session: .chats/...`.
- **If `.app/index.sqlite` is wiped**, the JSONL files alone rebuild the index but a few SQLite-only fields don't fully recover: `title` is regenerated from the first user message, `provider`/`model` defaults and timestamps come from per-message fields, but `skill_id` and the `body` summary are lost (the summary is regenerated only on demand to avoid an unwanted API spend).

### Attach notes to chat context
- Composer has an "Attach" button → multi-select note picker (searchable).
- Attached note titles show as chips above the composer.
- On send, attached notes are inlined into the system prompt as fenced blocks with titles. Token budget check: if combined >70% of model context, warn the user and offer to summarize.

### Encryption (per-note)
- Mark-secure: derive key = `argon2(password, salt)`, encrypt body with AES-256-GCM, rename `foo.md` → `foo.md.sec`, header = `{version, salt, nonce}` + ciphertext. File on disk is unreadable without the password.
- Secure note plaintext lives only in memory while the note is open. SQLite stores metadata only; secure notes are excluded from FTS indexing and embedding generation.
- **Session keys are retained until the app process exits**. No idle timer. No auto-wipe on window hide. The only thing that clears them is quitting the app. This is an explicit trade-off for ergonomics over belt-and-braces security.
- `Map<passwordFingerprint, Uint8Array>` holds derived keys — so a note opens without re-prompting if another note with the same password was already unlocked this session.
- Rust commands: `encrypt_note(path, password)`, `decrypt_note(path, password) -> string`, `change_password(old, new, scope)`.

### Plugin system (Obsidian-style, trusted)
- `.plugins/{id}/manifest.json` + `main.js`. Dynamic `import()` at startup.
- Plugin exports a class with `onload(app)` / `onunload()`.
- `App` API (minimal MVP):
  ```ts
  app.notes  .get(id) / .query(q) / .create() / .update()
  app.chat   .open(sessionId?) / .send(text, opts)
  app.ai     .complete(messages, opts)              // direct provider call for headless plugins
  app.skills .list() / .invoke(id, text)
  app.commands.register({ id, name, callback, hotkey? })
  app.ui     .addSidebarButton(...) / .addStatusBarItem(...)
  app.events .on('note:changed' | 'chat:message' | 'vault:ready', fn)
  ```
- Plugins run in the renderer (trusted, same as Obsidian). Documented clearly in the plugin-install UI.
- **Secure-note plaintext is never exposed to plugins.** `app.notes.get` returns the metadata with `body: null` for `is_secure` notes. A future `app.secure.unlock(id)` API (post-MVP) would prompt the user for the password before granting access.

## Milestones

1. **M1 — Shell**: Tauri + React + SQLite scaffold, open-vault flow, file import, CodeMirror editor, autosave, external file watcher.
2. **M2 — Search + AI chat**: FTS search, provider interface with all 3 adapters, plain chat panel, API-key management, chat sessions as JSONL (save/resume).
3. **M3 — Embeddings + attach-context**: transformers.js worker, hourly scheduler, semantic search UI, attach-notes-to-chat flow, extract-to-note.
4. **M4 — Skills**: skill file format, loader, picker UI, `/skill` shortcut.
5. **M5 — Encryption**: Rust crypto commands, secure flag, password modal, session key cache.
6. **M6 — Plugins**: loader, App API surface, ship 2 example plugins (daily note, word count) to validate the API.
7. **M7 — Polish**: onboarding, sample vault, installer signing, landing page.

## Verification (end-to-end)

Run `pnpm tauri dev` and perform:

1. Pick an existing folder with ~50 markdown files. All appear in the sidebar; autosave writes through within 2s of typing.
2. Edit a file externally (simulate Drive sync with a shell `>>`). App reflects the change within ~5s.
3. FTS search "meeting" — matches highlighted; open a result.
4. Wait for (or manually trigger) the hourly embedding refresh; confirm `embeddings.updated_at` catches up to `notes.mtime`.
5. Open AI chat, add a DeepSeek API key. Start a free chat and verify the assistant has no vault context unless notes are explicitly attached.
6. Switch provider to Claude mid-session → next message uses Claude; JSONL shows per-message provider/model.
7. Attach two notes to the composer → send a question → system prompt includes them; answer references only the attached notes.
8. Create a skill `translate-ru` → select it → send Russian text → verify response follows the skill's system prompt.
9. Highlight a valuable assistant message → "Save as note" → new `.md` appears in notes folder, with `source_session:` frontmatter pointing at the JSONL.
10. Reopen a past session from the sidebar → history replays → continue chatting → new messages append to the same JSONL.
11. Mark a note secure, enter a password → `.md.sec` on disk; content still readable in the current session. Confirm the note does not appear in FTS or semantic search. Open another secure note with same password → no prompt. **Close and reopen the app** → password required again.
12. Drop a plugin into `.plugins/word-count/` → reload → status bar shows word count; plugin-registered command is in the palette.

## Open questions / known risks

- **Code signing** — macOS installers need an Apple Developer account ($99/yr); Windows needs an Authenticode cert. Real infrastructure cost; deferred to M7.
- **Embedding model size** — `all-MiniLM-L6-v2` is ~30MB. Lazy-load on the first embedding job, cache to disk under `.app/`. Surface a one-time "downloading search model (~30MB)" banner in onboarding.
- **Filename privacy** — encryption protects content but not the filename, mtime, or directory tree, all of which Drive sync sees. A note titled `divorce-lawyers.md.sec` leaks intent. Documented as a known limitation; consider an opt-in "encrypt filenames" mode in phase 2.
- **Plugin trust model** — same as Obsidian: user-installed plugins run with full app permissions. No sandbox in MVP. Future option: load plugins in a Web Worker behind a postMessage-based App API.
- **Editor-vs-disk conflict** — if the user is actively editing note X and an external sync overwrites it, in-memory state diverges from disk. MVP: detect mtime change while the buffer is dirty → show a "file changed on disk, reload?" banner; never silently overwrite either side.
- **JSONL crash durability** — a partial write during crash leaves a malformed last line. The reader must tolerate (skip) trailing invalid JSON rather than refusing to open the session.

## Critical files to create

Greenfield project — no existing code to modify. The entry-point files that define the architecture and are hardest to change later:

- `src-tauri/src/crypto.rs` — encryption surface
- `src-tauri/src/vault.rs` — folder watcher with self-echo suppression
- `src/features/ai/provider.ts` — provider contract (everything else depends on this)
- `src/features/ai/sessions.ts` — JSONL format (document the schema; it's a public file format)
- `src/features/ai/skills.ts` — skill frontmatter schema (also a public format)
- `src/features/embeddings/scheduler.ts` — correctness-critical
- `src/features/secure/session.ts` — in-memory key store (security-critical)
- `src/features/plugins/app-api.ts` — plugin API (hardest to change later; design conservatively)
