# Nook — Implementation Plan (v2, files-only, Wails/Go)

> Revision of `design.md`. Changes from v1: no SQLite (everything is files + an in-memory index), no embeddings / semantic search (FTS only), and Go (Wails v2) instead of Rust (Tauri) for the shell. Plugins and shared "skill" files are deferred to v1.1 so the MVP stays shippable.

## Context

**Nook** is a local-first knowledge and AI-chat app — a small, private corner for your notes and conversations with AI. Everything lives on the user's disk: notes as markdown files, chats as JSONL, settings as JSON. No backend, no account, no telemetry, no database. Users sync across devices by pointing Google Drive / Yandex Disk / iCloud / Dropbox at the vault folder — the app doesn't care which.

Two overlapping use cases:

1. **Knowledge base** — write and search notes, import existing markdown, ask an AI assistant questions grounded in notes the user explicitly attaches.
2. **General AI chat client** — chat with Claude, OpenAI, or DeepSeek using your own API key, with optional note-attachment for context, and full session history.

Every byte of state except a disposable FTS cache lives in user-readable files. Delete `.app/`, the app rebuilds itself from the vault.

## Stack

- **Shell**: Wails v2 (Go backend + system webview: WKWebView / WebView2 / WebKitGTK)
- **Frontend**: React + Vite + TypeScript
- **Editor**: CodeMirror 6 with markdown language + live decorations
- **Search**: MiniSearch (in-memory FTS, JSON-serializable index)
- **File watcher**: `fsnotify` (Go)
- **Encryption**: Go — `golang.org/x/crypto/argon2` (key derivation) + stdlib `crypto/aes` + `crypto/cipher` (AES-256-GCM); derived key is cached in the Go process and never crosses to JS in raw form
- **Secret storage**: `github.com/zalando/go-keyring` — API keys only; wraps macOS Keychain / Windows Credential Manager / Linux Secret Service
- **State**: Zustand
- **UI**: Tailwind + shadcn/ui

## Vault layout on disk

```
my-vault/
├── notes/…                          # plain .md / .txt files (or .md.sec for secure)
├── .chats/
│   ├── 2026-04-20-abc123.jsonl      # source of truth: one message per line
│   └── 2026-04-20-abc123.meta.json  # sidecar: title, provider/model, summary, counts
└── .app/
    ├── fts.json                     # MiniSearch index snapshot (derived cache, safe to delete)
    └── config.json                  # user prefs + per-vault secure-mode salt
```

Everything except `.app/` is portable. Deleting `.app/fts.json` forces a full rebuild on next open; nothing is lost.

(`.skills/` and `.plugins/` directories are v1.1 territory — not part of MVP.)

## MVP scope

1. **Open-vault** — pick a folder, recursively scan `.md` / `.txt`, populate the in-memory index.
2. **Markdown editor** — CodeMirror with `[[wikilinks]]` (resolved by title; path disambiguates ties), `#inline-tags`, YAML-frontmatter `tags:`, live preview.
3. **Autosave** — debounced 2s after keystrokes; immediate flush on blur, window hide, app quit.
4. **External file watcher** — `fsnotify` with 5s debounce; re-parse changed files; suppress echoes of our own writes (2s tag window).
5. **Full-text search** — MiniSearch over title + body + tags for notes, title + summary for chat sessions. Filters: `tag:foo`, `path:folder/`, `"exact phrase"`. Powers the sidebar search UI and the attach-notes picker.
6. **FTS index cache** — snapshotted to `.app/fts.json` with a per-path mtime manifest; reconcile-on-open picks up external edits.
7. **AI chat panel, two modes** — free chat, or chat with user-attached notes inlined into the system prompt. No automatic retrieval.
8. **Providers** — Anthropic, OpenAI, DeepSeek. Minimal `fetch` adapters, SSE streaming, no SDKs. API keys stored in `go-keyring`.
9. **Per-chat config** — session owns `{provider, model, systemPrompt}`. (Reusable "skill" files come in v1.1.)
10. **Chat sessions as JSONL + meta sidecar** — one JSONL file per session in `.chats/`; a `.meta.json` sidecar holds title/provider/model/summary/counts. Sidebar lists, resumes, renames, deletes.
11. **Extract to note** — save selected chat message(s) to a new `.md` with `source_session:` frontmatter. "Save session summary as note" reuses the sidecar's `summary` field (no separate flow).
12. **Per-note encryption** — mark-secure → AES-256-GCM → `.md.sec`. One password per vault; prompted once per session; derived key cached in the Go process. Secure notes are excluded from FTS.

**Deferred to v1.1:**

- **Skills** — `.skills/{id}/SKILL.md` files with portable prompt/model configs.
- **Plugins** — `.plugins/` loader + App API.
- **Embeddings / semantic search / RAG**
- **Knowledge graph view**
- Mobile, local LLM (Ollama), live multi-device sync.

## Project structure

```
nook/
├── main.go                           # Wails entry point
├── app.go                            # bound App struct — methods callable from JS
├── backend/
│   ├── crypto.go                     # argon2 + AES-256-GCM; caches derived key in-process
│   ├── vault.go                      # recursive scan + fsnotify watcher
│   ├── keyring.go                    # go-keyring wrapper for API keys
│   └── fs.go                         # atomic write helpers (tmp + rename)
├── frontend/
│   ├── src/
│   │   ├── app/App.tsx
│   │   ├── features/
│   │   │   ├── editor/               # CodeMirror, autosave, wikilinks
│   │   │   ├── vault/                # watcher bridge, note CRUD, in-memory model
│   │   │   ├── search/
│   │   │   │   ├── index.ts          # MiniSearch wrapper (notes + chats)
│   │   │   │   ├── cache.ts          # atomic save/load of .app/fts.json
│   │   │   │   └── reconcile.ts      # compare cached mtimes to current, patch delta
│   │   │   ├── ai/
│   │   │   │   ├── providers/        # anthropic.ts | openai.ts | deepseek.ts
│   │   │   │   ├── provider.ts       # common interface
│   │   │   │   ├── context.ts        # attached-note context + prompt assembly
│   │   │   │   ├── sessions.ts       # JSONL + .meta.json read/write
│   │   │   │   └── ChatPanel.tsx
│   │   │   └── secure/               # unlock UI (no key material here)
│   │   └── store/
│   └── package.json
├── wails.json
├── go.mod
└── go.sum
```

Wails auto-generates TypeScript bindings under `frontend/wailsjs/` for methods bound on the `App` struct; the frontend imports them directly.

## Data model (files only)

### 1. Source-of-truth files on disk

| Kind           | Location                    | Format                                                                                    |
|----------------|-----------------------------|-------------------------------------------------------------------------------------------|
| Note (plain)   | `notes/**/*.md` or `*.txt`  | Markdown, YAML frontmatter optional                                                       |
| Note (secure)  | `notes/**/*.md.sec`         | `{version, nonce} \|\| AES-256-GCM(ciphertext)` — all secure notes share the vault key     |
| Chat session   | `.chats/{id}.jsonl`         | One JSON message per line: `{role, content, ts, provider, model, attachments?}`           |
| Chat metadata  | `.chats/{id}.meta.json`     | `{title, provider, model, systemPrompt, summary, started_at, updated_at, message_count}`  |
| App config     | `.app/config.json`          | User prefs + `secureSalt` (per-vault argon2 salt, base64)                                 |

### 2. In-memory runtime model

Built by scanning files on open; kept in sync by the editor and file watcher.

- **Notes map** — `id → {path, title, body, tags, frontmatter, mtime, isSecure}`. Secure notes hold `body: null` until unlocked; decrypted plaintext lives only in the open-editor buffer and is never assigned into the index.
- **MiniSearch (notes scope)** — fields: `title`, `body`, `tags`. Secure notes excluded entirely.
- **MiniSearch (chats scope)** — fields: `title`, `summary`. Fed from `.meta.json` sidecars.
- **Links**, **tag index** — built from wikilink / tag parsing.

### 3. FTS cache (`.app/fts.json`)

MiniSearch's `toJSON()` / `loadJSON()` serializes the notes scope plus a per-path mtime manifest. The chats scope is rebuilt from `.meta.json` sidecars on startup — cheap, and the app is the only writer of those sidecars, so they don't need mtime reconcile.

**Write:** on graceful app quit and on a 30s-idle timer. Atomic: write `fts.json.tmp`, then rename.

**Load (on open):**
1. If missing or unparseable → full rebuild by scanning the vault.
2. Otherwise: load snapshot, then reconcile notes — for each current `.md` / `.txt`, if `fs.mtime > cached.mtime` re-parse and `index.replace`; remove entries for vanished files; add new ones.
3. Search is usable as soon as the snapshot loads; reconcile runs behind it.

## Key subsystems

### File watcher
- `fsnotify` on Linux/macOS is non-recursive: the Go side walks the tree at startup, registers each directory, and adds watches for new subdirectories on `Create` events.
- Debounce 5s per path. Tag recent-write paths for 2s to suppress echoes of our own writes. **Known risk:** a sync client writing within the same 2s window will also be suppressed — acceptable for MVP; if users report lost updates, move to content-hash comparison instead of path-tag.
- External change → re-parse file, update notes map + MiniSearch entry, emit a Wails event to the frontend. Secure notes: metadata-only update.

### AI provider abstraction

```ts
interface AiProvider {
  id: 'anthropic' | 'openai' | 'deepseek';
  chat(messages: Msg[], opts: {model, stream, system?}): AsyncIterable<Delta>;
  listModels(): Promise<Model[]>;
  contextWindow(model: string): number;   // tokens; powers the attach-notes budget check
}
```

- Minimal `fetch` wrappers, no SDKs.
- DeepSeek extends the OpenAI adapter with a different `baseUrl` and default model.
- Streaming via SSE, yielded as text deltas.
- `contextWindow` reads from a hardcoded per-provider table (updated with each release).
- Ranking in search: MiniSearch's modified TF-IDF — sufficient for MVP; swap if quality becomes an issue.

### Chat sessions (JSONL + meta sidecar)
- `.chats/{YYYY-MM-DD-HHMMSS}-{shortid}.jsonl` — one message per line: `{role, content, ts, provider, model, attachments?}`. Append-only.
- `.chats/{same-id}.meta.json` — rewritten atomically whenever any field changes. Written **only** by the app.
- Continue session: read JSONL, replay into UI, append new lines.
- If a `.meta.json` is deleted: rebuilt from the JSONL — `title` from the first user message, `provider`/`model` from per-message fields, timestamps from `ts`. `systemPrompt` and `summary` are lost; `summary` is regenerated only on demand (avoids unwanted API spend).
- JSONL reader tolerates a trailing malformed line (crash durability).

### Attach notes to chat context
- Composer has an "Attach" button → multi-select picker, searched via the notes FTS scope.
- Attached titles render as chips above the composer.
- On send, attachments inline into the system prompt as fenced blocks with titles. If combined > 70% of `contextWindow(model)`, warn the user and offer to summarize.

### Encryption (one password per vault)
- First time the user marks a note secure: prompt for a password; generate a random 16-byte salt; store base64 in `.app/config.json` as `secureSalt`. Derive `key = argon2id(password, salt)`; cache `key` in the Go process.
- Each secure note on disk: `{version, 12-byte random nonce} || AES-256-GCM(key, nonce, plaintext)`. Rename source `foo.md` → `foo.md.sec`. **Nonce is freshly random per encryption** — critical for GCM safety.
- Subsequent app sessions: prompt for the password once when any `.md.sec` is opened; derive and cache the key. Every other secure note opens without re-prompting.
- Session key lives only in Go memory; only plaintext crosses to JS (so the editor can render it). Cache is cleared when the app process exits. No idle timer.
- Bound Go methods on `App`: `UnlockSecure(password) error`, `EncryptNote(path) error`, `DecryptNote(path) (string, error)`, `ChangeSecurePassword(old, new) error`.
- Secure notes are excluded from MiniSearch; metadata (path, title, mtime) is still tracked so they show up in the sidebar.

## Milestones

1. **M1 — Shell + editor**: Wails + React scaffold, open-vault, file import, CodeMirror editor, autosave, fsnotify watcher + event bridge to the frontend.
2. **M2 — Search**: MiniSearch notes scope, `.app/fts.json` cache (atomic write, reconcile-on-open), sidebar search UI, filters.
3. **M3 — AI chat**: provider interface + 3 adapters, chat panel, API-key management via `go-keyring`, JSONL + meta sidecar sessions (save / resume), chat FTS scope.
4. **M4 — Attach + extract**: attach-notes-to-chat flow, extract-to-note, session summary generation.
5. **M5 — Encryption**: Go crypto, secure flag, password modal, session key cache, one-password-per-vault model.
6. **M6 — Polish**: onboarding, sample vault, installer signing (NSIS / DMG / signed `.app`), landing page.

## Verification (end-to-end)

Run `wails dev` and perform:

1. Open a folder with ~50 markdown files. Sidebar populates; autosave writes through within 2s of typing.
2. Edit a file externally (simulate Drive sync with `>>`). App reflects the change within ~5s; search finds the new content.
3. FTS search "meeting" — hits highlighted with snippets; `tag:work meeting` narrows; `"exact phrase"` works.
4. Quit and reopen — cold start loads from `.app/fts.json`. Delete the cache, reopen, verify full rebuild.
5. Add a DeepSeek API key. Free chat has no vault context.
6. Switch provider to Claude mid-session → next message uses Claude; JSONL shows per-message provider/model.
7. Attach two notes → send → system prompt includes them.
8. "Save as note" from a chat → new `.md` with `source_session:` frontmatter.
9. Reopen a past session → history replays → new messages append to the JSONL; `.meta.json` updates.
10. Delete a `.meta.json` sidecar → reopen the session → regenerated from JSONL.
11. Mark a note secure, set a password → `.md.sec` on disk. Does not appear in FTS. Open another secure note → no re-prompt. **Quit + reopen** → password required again.

## Open questions / known risks

- **Code signing** — Apple Developer account ($99/yr); Windows Authenticode cert. Wails has first-class NSIS / DMG / signed `.app` builds. Deferred to M6.
- **Linux WebKitGTK quirks** — some CSS / font issues. MVP targets macOS and Windows; Linux is best-effort.
- **Filename privacy** — encryption protects content, not filename / mtime / directory tree. `divorce-lawyers.md.sec` leaks intent. Opt-in "encrypt filenames" mode is a later item.
- **Editor-vs-disk conflict** — external overwrite while the buffer is dirty: detect mtime change, show a "reload?" banner; never silently overwrite either side.
- **JSONL crash durability** — reader must skip a trailing malformed line.
- **FTS cache corruption** — atomic `.tmp`-then-rename; on load failure, delete and full-rebuild.
- **Self-echo suppression eating real updates** — sync-client writes within the 2s echo window are ignored. Accept for MVP; upgrade to content-hash if it bites users.
- **Cold-rebuild on very large vaults** — 50k notes without a cache can take a while. Progress banner; expose results incrementally.
- **Future vector search** — when RAG returns (v1.1+), embeddings persist as a single binary sidecar and `AiProvider` gains an optional `embed()` method. Keep the interface forward-compatible.

## Critical files to create

The hardest-to-change entry points — they're either public file formats or cross-cutting contracts. Design conservatively.

- `frontend/src/features/ai/provider.ts` — provider contract (every adapter and every caller depends on it).
- `frontend/src/features/ai/sessions.ts` — JSONL + meta sidecar schema (public file format; users will write tools against it).
- `frontend/src/features/search/index.ts` — MiniSearch wrapper + reconcile-on-open; the whole app queries through it.
- `app.go` — bound Wails `App` struct; every method is public API to JS.
- `backend/crypto.go` — security-critical; the `.md.sec` header layout is public once shipped.
