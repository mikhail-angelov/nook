package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestChatSessionAppendLoadListAndRebuildMeta(t *testing.T) {
	root := t.TempDir()
	sessionID := "2026-04-20-abc123"

	line1 := `{"role":"user","content":"Hello","ts":100,"provider":"openai","model":"gpt-4o-mini"}`
	line2 := `{"role":"assistant","content":"Hi","ts":200,"provider":"openai","model":"gpt-4o-mini"}`

	if err := AppendChatSessionLine(root, sessionID, line1); err != nil {
		t.Fatalf("AppendChatSessionLine(line1) returned error: %v", err)
	}
	if err := AppendChatSessionLine(root, sessionID, line2); err != nil {
		t.Fatalf("AppendChatSessionLine(line2) returned error: %v", err)
	}

	session, err := LoadChatSession(root, sessionID)
	if err != nil {
		t.Fatalf("LoadChatSession returned error: %v", err)
	}
	if got, want := len(session.Messages), 2; got != want {
		t.Fatalf("LoadChatSession message count = %d, want %d", got, want)
	}
	if session.Metadata.Title != "Hello" {
		t.Fatalf("LoadChatSession title = %q, want %q", session.Metadata.Title, "Hello")
	}
	if session.Metadata.Summary != "" || session.Metadata.SystemPrompt != "" {
		t.Fatalf("LoadChatSession meta fields = %#v, want empty summary/systemPrompt", session.Metadata)
	}
	if session.Metadata.MessageCount != 2 {
		t.Fatalf("LoadChatSession message count metadata = %d, want 2", session.Metadata.MessageCount)
	}

	listed, err := ListChatSessions(root, 20)
	if err != nil {
		t.Fatalf("ListChatSessions returned error: %v", err)
	}
	if got, want := len(listed), 1; got != want {
		t.Fatalf("ListChatSessions count = %d, want %d", got, want)
	}
	if listed[0].ID != sessionID {
		t.Fatalf("ListChatSessions id = %q, want %q", listed[0].ID, sessionID)
	}
	if listed[0].Title != "Hello" {
		t.Fatalf("ListChatSessions title = %q, want %q", listed[0].Title, "Hello")
	}

	metaPath := filepath.Join(root, ".chats", sessionID+".meta.json")
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("expected rebuilt meta file at %s: %v", metaPath, err)
	}

	rawMeta, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("ReadFile(meta) returned error: %v", err)
	}
	var meta ChatSessionMetadata
	if err := json.Unmarshal(rawMeta, &meta); err != nil {
		t.Fatalf("meta JSON unmarshal failed: %v", err)
	}
	if meta.Title != "Hello" || meta.MessageCount != 2 {
		t.Fatalf("rebuilt meta = %#v, want title Hello and 2 messages", meta)
	}
}

func TestChatSessionLoadSkipsTrailingMalformedLine(t *testing.T) {
	root := t.TempDir()
	sessionID := "2026-04-20-badline"

	content := `{"role":"user","content":"Hello","ts":100,"provider":"openai","model":"gpt-4o-mini"}
not-json`
	if err := atomicWriteFile(filepath.Join(root, ".chats", sessionID+".jsonl"), []byte(content)); err != nil {
		t.Fatalf("atomicWriteFile returned error: %v", err)
	}

	session, err := LoadChatSession(root, sessionID)
	if err != nil {
		t.Fatalf("LoadChatSession returned error: %v", err)
	}
	if got, want := len(session.Messages), 1; got != want {
		t.Fatalf("LoadChatSession message count = %d, want %d", got, want)
	}
	if session.Messages[0].Content != "Hello" {
		t.Fatalf("LoadChatSession message content = %q, want Hello", session.Messages[0].Content)
	}
}

func TestChatSessionRenameAndDelete(t *testing.T) {
	root := t.TempDir()
	oldID := "2026-04-20-old"
	newID := "2026-04-21-new"

	if err := AppendChatSessionLine(root, oldID, `{"role":"user","content":"Hello","ts":100,"provider":"openai","model":"gpt-4o-mini"}`); err != nil {
		t.Fatalf("AppendChatSessionLine returned error: %v", err)
	}
	if err := SaveChatSessionMeta(root, oldID, ChatSessionMetadata{
		Title:        "Renamed chat",
		Provider:     "openai",
		Model:        "gpt-4o-mini",
		SystemPrompt: "sys",
		Summary:      "summary",
		StartedAt:    100,
		UpdatedAt:    200,
		MessageCount: 1,
	}); err != nil {
		t.Fatalf("SaveChatSessionMeta returned error: %v", err)
	}

	renamed, err := RenameChatSession(root, oldID, newID)
	if err != nil {
		t.Fatalf("RenameChatSession returned error: %v", err)
	}
	if renamed.ID != newID {
		t.Fatalf("RenameChatSession id = %q, want %q", renamed.ID, newID)
	}
	if renamed.Title != "Renamed chat" {
		t.Fatalf("RenameChatSession title = %q, want %q", renamed.Title, "Renamed chat")
	}

	if _, err := os.Stat(filepath.Join(root, ".chats", oldID+".jsonl")); !os.IsNotExist(err) {
		t.Fatalf("old jsonl still exists or stat failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".chats", newID+".meta.json")); err != nil {
		t.Fatalf("renamed meta missing: %v", err)
	}

	if err := DeleteChatSession(root, newID); err != nil {
		t.Fatalf("DeleteChatSession returned error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".chats", newID+".jsonl")); !os.IsNotExist(err) {
		t.Fatalf("jsonl still exists after delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".chats", newID+".meta.json")); !os.IsNotExist(err) {
		t.Fatalf("meta still exists after delete: %v", err)
	}
}

