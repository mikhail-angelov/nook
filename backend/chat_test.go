package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestChatSessionAppendAndList(t *testing.T) {
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

	raw, err := ReadChatSessionFile(root, sessionID)
	if err != nil {
		t.Fatalf("ReadChatSessionFile returned error: %v", err)
	}
	if raw != line1+"\n"+line2+"\n" {
		t.Fatalf("ReadChatSessionFile = %q, want two appended lines", raw)
	}

	ids, err := ListChatSessionIDs(root)
	if err != nil {
		t.Fatalf("ListChatSessionIDs returned error: %v", err)
	}
	if len(ids) != 1 || ids[0] != sessionID {
		t.Fatalf("ListChatSessionIDs = %v, want [%q]", ids, sessionID)
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
