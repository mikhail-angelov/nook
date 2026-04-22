# Nook

Nook is a local-first notes and AI chat app for people who want their knowledge base and their conversations in the same place, under their control.

Your notes stay as markdown files on disk. Your chat history stays as JSONL files on disk. There is no hosted backend, no account, and no app-managed cloud sync. You point Nook at a folder, and that folder is your vault.

## Why Nook

Most note apps are weak chat clients, and most AI chat apps treat your notes like an afterthought or a cloud feature. Nook is built around a simpler model:

- write and organize notes in plain files
- chat with your own AI provider accounts
- attach notes to a conversation only when you want that context
- keep the app portable because the data is portable

## What It Does

- Open a local vault folder and index markdown and text notes
- Edit notes with a markdown-focused editor and autosave
- Search notes locally
- Chat with Anthropic, OpenAI, and DeepSeek using your own API keys
- Save chat sessions as local files and reopen them later
- Attach notes to chats as explicit context
- Extract useful chat output back into notes
- Encrypt individual notes with a vault password

## Local-First By Default

Nook is designed so the important state is readable outside the app:

```text
my-vault/
├── notes/…                       # markdown/text notes
├── .chats/
│   ├── session.jsonl             # chat messages
│   └── session.meta.json         # chat metadata
└── .app/
    ├── config.json               # local app config
    └── fts.json                  # derived search cache
```

Notes remain normal files. Chat sessions are append-friendly JSONL. The `.app/` directory is app state and cache; the vault content is the part meant to matter long-term.

## Privacy Model

- No Nook account
- No Nook-managed sync service
- No mandatory remote storage
- API keys are stored in the OS keychain
- Secure notes are encrypted on disk and excluded from search indexing

If you use AI providers, your prompts and attached note content go to the provider you selected for that chat. Nook does not remove that tradeoff; it makes it explicit.

## Current Status

Nook is an active desktop app prototype built with Wails, Go, React, and TypeScript.

The repository already contains the core vault, editor, search, chat session, provider, and secure-note flows. It is not positioned yet as a finished end-user release with polished onboarding, packaging, or signed installers.

## Stack

- Wails v2
- Go backend
- React + Vite + TypeScript frontend
- CodeMirror editor
- Zustand state
- Local file-based vault and chat storage

## Development

Requirements:

- Go
- Node.js and npm
- Wails CLI

Run the frontend dependencies:

```bash
cd frontend
npm install
```

Run the app in development mode from the repo root:

```bash
wails dev
```

Build the frontend only:

```bash
cd frontend
npm run build
```

Run tests:

```bash
go test ./...
cd frontend && npm test
```

## Roadmap

Near-term work is focused on making the current desktop app coherent and release-ready:

- onboarding and empty-state polish
- integration cleanup across the app shell
- broader verification against the design checklist
- packaging and release polish

Deferred ideas from earlier design work include plugins, reusable skill files, semantic search, and richer sync-oriented workflows.
