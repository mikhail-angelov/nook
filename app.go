package main

import (
	"context"
	"encoding/json"
	"fmt"

	"nook/backend"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	watcher *backend.WatcherManager
	secure  *backend.SecureVaultManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	app := &App{secure: backend.NewSecureVaultManager()}
	app.watcher = backend.NewWatcherManager(func(event backend.VaultEvent) {
		if app.ctx != nil {
			runtime.EventsEmit(app.ctx, "vault://event", event)
		}
	})
	return app
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(_ context.Context) {
	if a.watcher != nil {
		_ = a.watcher.Stop()
	}
}

func (a *App) VaultPickFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open vault",
	})
}

func (a *App) VaultScan(root string) ([]backend.ScannedNote, error) {
	return backend.ScanVault(root)
}

func (a *App) VaultReadFile(root string, relPath string) (string, error) {
	return backend.ReadFile(root, relPath)
}

func (a *App) VaultWriteFile(root string, relPath string, contents string) (int64, error) {
	if a.watcher != nil {
		a.watcher.TagSelf(relPath)
	}
	return backend.WriteFile(root, relPath, contents)
}

func (a *App) VaultDeleteFile(root string, relPath string) error {
	if a.watcher != nil {
		a.watcher.TagSelf(relPath)
	}
	return backend.DeleteFile(root, relPath)
}

func (a *App) VaultRenameFile(root string, oldRelPath string, newRelPath string) (backend.ScannedNote, error) {
	if a.watcher != nil {
		a.watcher.TagSelf(oldRelPath, newRelPath)
	}
	return backend.RenameFile(root, oldRelPath, newRelPath)
}

func (a *App) VaultStartWatching(root string) error {
	if a.watcher == nil {
		a.watcher = backend.NewWatcherManager(nil)
	}
	return a.watcher.Start(root)
}

func (a *App) VaultStopWatching() error {
	if a.watcher == nil {
		return nil
	}
	return a.watcher.Stop()
}

func (a *App) ChatListSessionIDs(root string) ([]string, error) {
	return backend.ListChatSessionIDs(root)
}

func (a *App) ChatReadSessionFile(root string, sessionID string) (string, error) {
	return backend.ReadChatSessionFile(root, sessionID)
}

func (a *App) ChatAppendSessionLine(root string, sessionID string, line string) error {
	return backend.AppendChatSessionLine(root, sessionID, line)
}

func (a *App) ChatReadSessionMeta(root string, sessionID string) (string, error) {
	return backend.ReadChatSessionMeta(root, sessionID)
}

func (a *App) ChatWriteSessionMeta(root string, sessionID string, metadata string) error {
	var parsed backend.ChatSessionMetadata
	if err := json.Unmarshal([]byte(metadata), &parsed); err != nil {
		return err
	}
	return backend.SaveChatSessionMeta(root, sessionID, parsed)
}

func (a *App) ChatRenameSession(root string, oldSessionID string, newSessionID string) (backend.ChatSessionMetadata, error) {
	return backend.RenameChatSession(root, oldSessionID, newSessionID)
}

func (a *App) ChatDeleteSession(root string, sessionID string) error {
	return backend.DeleteChatSession(root, sessionID)
}

func (a *App) UnlockSecure(root string, password string) error {
	if a.secure == nil {
		a.secure = backend.NewSecureVaultManager()
	}
	return a.secure.UnlockSecure(root, password)
}

func (a *App) EncryptNote(root string, relPath string, contents string) (backend.ScannedNote, error) {
	if a.secure == nil {
		a.secure = backend.NewSecureVaultManager()
	}
	target := backend.SecureNoteTargetPath(relPath)
	if a.watcher != nil {
		a.watcher.TagSelf(relPath, target)
	}
	if err := a.secure.EncryptNote(root, relPath, contents); err != nil {
		return backend.ScannedNote{}, err
	}
	notes, err := backend.ScanVault(root)
	if err != nil {
		return backend.ScannedNote{}, err
	}
	for _, note := range notes {
		if note.ID == target {
			return note, nil
		}
	}
	return backend.ScannedNote{}, fmt.Errorf("encrypted note %q not found after write", target)
}

func (a *App) DecryptNote(root string, relPath string) (string, error) {
	if a.secure == nil {
		a.secure = backend.NewSecureVaultManager()
	}
	return a.secure.DecryptNote(root, relPath)
}

func (a *App) ChangeSecurePassword(root string, oldPassword string, newPassword string) error {
	if a.secure == nil {
		a.secure = backend.NewSecureVaultManager()
	}
	return a.secure.ChangeSecurePassword(root, oldPassword, newPassword)
}

func (a *App) ProviderApiKeyLoad(providerId string) (*string, error) {
	return backend.ProviderApiKeyLoad(providerId)
}

func (a *App) ProviderApiKeySave(providerId string, apiKey string) error {
	return backend.ProviderApiKeySave(providerId, apiKey)
}

func (a *App) ProviderApiKeyDelete(providerId string) error {
	return backend.ProviderApiKeyDelete(providerId)
}

func (a *App) ProviderApiKeyList() ([]string, error) {
	return backend.ProviderApiKeyList()
}

func (a *App) GetSettings() (backend.Settings, error) {
	return backend.LoadSettings()
}

func (a *App) UpdateSettings(settings backend.Settings) error {
	return backend.SaveSettings(settings)
}
