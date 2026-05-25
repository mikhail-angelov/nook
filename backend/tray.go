package backend

import (
	"context"
	"log"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SystrayManager manages the application's background behavior.
// On Linux (where native system tray requires GTK/appindicator),
// it provides the equivalent UX through Wails' built-in window management:
//   - Start hidden, minimize to tray on close
//   - Global hotkey opens Quick Note (PR #4)
//   - On macOS/Windows, Wails native tray is used instead.
type SystrayManager struct {
	ctx context.Context
}

// NewSystrayManager creates a new SystrayManager.
func NewSystrayManager(_ []byte) *SystrayManager {
	return &SystrayManager{}
}

// Start saves the context for event emission.
func (s *SystrayManager) Start(ctx context.Context) error {
	s.ctx = ctx
	log.Println("Systray: running in background mode (minimize-to-tray + global hotkey)")
	return nil
}

// Stop is a no-op in this implementation.
func (s *SystrayManager) Stop() {}

// ShowWindow restores the main application window.
// Called from frontend when user wants to show the window.
func (s *SystrayManager) ShowWindow() {
	if s.ctx != nil {
		runtime.EventsEmit(s.ctx, "tray://show-window", nil)
	}
}
