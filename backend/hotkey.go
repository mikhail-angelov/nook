package backend

import (
	"context"
	"fmt"

	"golang.design/x/hotkey"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// HotkeyManager manages a global hotkey for quick note capture.
type HotkeyManager struct {
	ctx context.Context
	hk  *hotkey.Hotkey
}

// NewHotkeyManager creates a new HotkeyManager.
func NewHotkeyManager() *HotkeyManager {
	return &HotkeyManager{}
}

// Start registers the global hotkey (Ctrl+Shift+N) and listens for presses.
// On each press, a 'hotkey://quick-note' event is emitted to the frontend.
func (h *HotkeyManager) Start(ctx context.Context) error {
	h.ctx = ctx

	modifiers := []hotkey.Modifier{hotkey.ModCtrl, hotkey.ModShift}
	h.hk = hotkey.New(modifiers, hotkey.KeyN)
	if h.hk == nil {
		return fmt.Errorf("hotkey: failed to register Ctrl+Shift+N")
	}

	if err := h.hk.Register(); err != nil {
		return fmt.Errorf("hotkey: register: %w", err)
	}

	go func() {
		for range h.hk.Keydown() {
			if h.ctx != nil {
				runtime.EventsEmit(h.ctx, "hotkey://quick-note", nil)
			}
		}
	}()

	return nil
}

// Stop unregisters the hotkey.
func (h *HotkeyManager) Stop() error {
	if h.hk != nil {
		return h.hk.Unregister()
	}
	return nil
}
