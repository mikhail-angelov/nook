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

type ChatSession struct {
	ID       string               `json:"id"`
	Messages []ChatSessionMessage `json:"messages"`
	Metadata ChatSessionMetadata   `json:"metadata"`
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

func LoadChatSession(root string, sessionID string) (ChatSession, error) {
	messages, err := readChatSessionMessages(root, sessionID)
	if err != nil {
		return ChatSession{}, err
	}

	derived := deriveChatSessionMetadata(sessionID, messages)
	metadata := derived

	existing, err := readStoredChatSessionMetadata(root, sessionID)
	if err != nil {
		return ChatSession{}, err
	}
	if existing != nil {
		metadata = mergeChatSessionMetadata(*existing, derived)
		if err := SaveChatSessionMeta(root, sessionID, metadata); err != nil {
			return ChatSession{}, err
		}
	} else {
		if err := SaveChatSessionMeta(root, sessionID, metadata); err != nil {
			return ChatSession{}, err
		}
	}

	return ChatSession{
		ID:       sessionID,
		Messages: messages,
		Metadata: metadata,
	}, nil
}

func RebuildChatSessionMeta(root string, sessionID string) (ChatSessionMetadata, error) {
	session, err := LoadChatSession(root, sessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	return session.Metadata, nil
}

func ListChatSessions(root string, limit int) ([]ChatSessionMetadata, error) {
	ids, err := ListChatSessionIDs(root)
	if err != nil {
		return nil, err
	}

	sessions := make([]ChatSessionMetadata, 0, len(ids))
	for _, sessionID := range ids {
		session, err := LoadChatSession(root, sessionID)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session.Metadata)
	}

	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].UpdatedAt != sessions[j].UpdatedAt {
			return sessions[i].UpdatedAt > sessions[j].UpdatedAt
		}
		return sessions[i].ID > sessions[j].ID
	})

	if limit > 0 && len(sessions) > limit {
		sessions = sessions[:limit]
	}

	return sessions, nil
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

	session, err := LoadChatSession(root, newSessionID)
	if err != nil {
		return ChatSessionMetadata{}, err
	}
	return session.Metadata, nil
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

func readStoredChatSessionMetadata(root string, sessionID string) (*ChatSessionMetadata, error) {
	raw, err := ReadChatSessionMeta(root, sessionID)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var metadata ChatSessionMetadata
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return nil, nil
	}
	return &metadata, nil
}

func readChatSessionMessages(root string, sessionID string) ([]ChatSessionMessage, error) {
	raw, err := ReadChatSessionFile(root, sessionID)
	if err != nil {
		return nil, err
	}
	return parseChatSessionMessages(raw), nil
}

func deriveChatSessionMetadata(sessionID string, messages []ChatSessionMessage) ChatSessionMetadata {
	title := "Untitled chat"
	provider := "openai"
	model := "gpt-4o-mini"
	startedAt := int64(0)
	updatedAt := int64(0)

	if len(messages) > 0 {
		startedAt = messages[0].Ts
		updatedAt = messages[len(messages)-1].Ts
		provider = messages[0].Provider
		model = messages[0].Model
	}

	for _, message := range messages {
		if message.Role != "user" {
			continue
		}
		if trimmed := strings.TrimSpace(message.Content); trimmed != "" {
			title = trimmed
			break
		}
	}
	if title == "Untitled chat" && len(messages) > 0 {
		if trimmed := strings.TrimSpace(messages[0].Content); trimmed != "" {
			title = trimmed
		}
	}

	return ChatSessionMetadata{
		ID:           sessionID,
		Title:        title,
		Provider:     provider,
		Model:        model,
		SystemPrompt: "",
		Summary:      "",
		StartedAt:    startedAt,
		UpdatedAt:    updatedAt,
		MessageCount: len(messages),
	}
}

func mergeChatSessionMetadata(existing ChatSessionMetadata, derived ChatSessionMetadata) ChatSessionMetadata {
	metadata := derived
	metadata.Title = chooseString(existing.Title, derived.Title)
	metadata.Provider = chooseString(existing.Provider, derived.Provider)
	metadata.Model = chooseString(existing.Model, derived.Model)
	metadata.SystemPrompt = existing.SystemPrompt
	metadata.Summary = existing.Summary
	return metadata
}

func chooseString(existing string, fallback string) string {
	if strings.TrimSpace(existing) != "" {
		return existing
	}
	return fallback
}

func parseChatSessionMessages(raw string) []ChatSessionMessage {
	lines := strings.Split(normalizeNewlines(raw), "\n")
	messages := make([]ChatSessionMessage, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		message, ok := parseChatSessionMessage(line)
		if !ok {
			continue
		}
		messages = append(messages, message)
	}
	return messages
}

func parseChatSessionMessage(line string) (ChatSessionMessage, bool) {
	var parsed struct {
		Role        string   `json:"role"`
		Content     string   `json:"content"`
		Ts          int64    `json:"ts"`
		Provider    string   `json:"provider"`
		Model       string   `json:"model"`
		Attachments []string `json:"attachments"`
	}
	if err := json.Unmarshal([]byte(line), &parsed); err != nil {
		return ChatSessionMessage{}, false
	}
	if parsed.Role != "user" && parsed.Role != "assistant" {
		return ChatSessionMessage{}, false
	}
	if strings.TrimSpace(parsed.Content) == "" {
		return ChatSessionMessage{}, false
	}
	if parsed.Ts == 0 {
		return ChatSessionMessage{}, false
	}
	if parsed.Provider != "anthropic" && parsed.Provider != "openai" && parsed.Provider != "deepseek" {
		return ChatSessionMessage{}, false
	}
	if strings.TrimSpace(parsed.Model) == "" {
		return ChatSessionMessage{}, false
	}

	message := ChatSessionMessage{
		Role:     parsed.Role,
		Content:  parsed.Content,
		Ts:       parsed.Ts,
		Provider: parsed.Provider,
		Model:    parsed.Model,
	}
	if len(parsed.Attachments) > 0 {
		message.Attachments = make([]string, 0, len(parsed.Attachments))
		for _, attachment := range parsed.Attachments {
			if strings.TrimSpace(attachment) == "" {
				continue
			}
			message.Attachments = append(message.Attachments, attachment)
		}
	}
	return message, true
}

func normalizeNewlines(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	return strings.ReplaceAll(value, "\r", "\n")
}
