package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type ChatSessionMessage struct {
	Role        string   `json:"role"`
	Content     string   `json:"content"`
	Ts          int64    `json:"ts"`
	Provider    string   `json:"provider"`
	Model       string   `json:"model"`
	Attachments []string `json:"attachments,omitempty"`
}

type ChatSessionMetadata struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	SystemPrompt string `json:"systemPrompt"`
	Summary      string `json:"summary"`
	StartedAt    int64  `json:"started_at"`
	UpdatedAt    int64  `json:"updated_at"`
	MessageCount int    `json:"message_count"`
}

func ListChatSessionIDs(root string) ([]string, error) {
	dir, err := chatSessionDir(root)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".jsonl") {
			continue
		}
		ids = append(ids, strings.TrimSuffix(name, ".jsonl"))
	}

	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	return ids, nil
}

func ReadChatSessionFile(root string, sessionID string) (string, error) {
	path, err := chatSessionFilePath(root, sessionID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func AppendChatSessionLine(root string, sessionID string, line string) error {
	path, err := chatSessionFilePath(root, sessionID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.WriteString(strings.TrimRight(line, "\r\n") + "\n")
	return err
}

func ReadChatSessionMeta(root string, sessionID string) (string, error) {
	path, err := chatSessionMetaPath(root, sessionID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func SaveChatSessionMeta(root string, sessionID string, metadata ChatSessionMetadata) error {
	path, err := chatSessionMetaPath(root, sessionID)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	return atomicWriteFile(path, encoded)
}

func RenameChatSession(root string, oldSessionID string, newSessionID string) (ChatSessionMetadata, error) {
	oldJSONL, err := chatSessionFilePath(root, oldSessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	newJSONL, err := chatSessionFilePath(root, newSessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	if err := os.MkdirAll(filepath.Dir(newJSONL), 0o755); err != nil {
		return ChatSessionMetadata{}, err
	}
	if err := os.Rename(oldJSONL, newJSONL); err != nil {
		return ChatSessionMetadata{}, err
	}

	oldMeta, err := chatSessionMetaPath(root, oldSessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	newMeta, err := chatSessionMetaPath(root, newSessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	if _, statErr := os.Stat(oldMeta); statErr == nil {
		if err := os.Rename(oldMeta, newMeta); err != nil {
			return ChatSessionMetadata{}, err
		}
	}

	data, err := os.ReadFile(newMeta)
	if err != nil {
		if os.IsNotExist(err) {
			return ChatSessionMetadata{ID: newSessionID}, nil
		}
		return ChatSessionMetadata{}, err
	}
	var meta ChatSessionMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		return ChatSessionMetadata{ID: newSessionID}, nil
	}
	meta.ID = newSessionID
	if err := SaveChatSessionMeta(root, newSessionID, meta); err != nil {
		return ChatSessionMetadata{}, err
	}
	return meta, nil
}

func DeleteChatSession(root string, sessionID string) error {
	jsonlPath, err := chatSessionFilePath(root, sessionID)
	if err != nil {
		return err
	}
	if err := os.Remove(jsonlPath); err != nil && !os.IsNotExist(err) {
		return err
	}

	metaPath, err := chatSessionMetaPath(root, sessionID)
	if err != nil {
		return err
	}
	if err := os.Remove(metaPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func chatSessionDir(root string) (string, error) {
	return SafeVaultPath(root, ".chats")
}

func chatSessionFilePath(root string, sessionID string) (string, error) {
	return SafeVaultPath(root, filepath.ToSlash(filepath.Join(".chats", sessionID+".jsonl")))
}

func chatSessionMetaPath(root string, sessionID string) (string, error) {
	return SafeVaultPath(root, filepath.ToSlash(filepath.Join(".chats", sessionID+".meta.json")))
}
