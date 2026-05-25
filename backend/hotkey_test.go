package backend

import (
	"context"
	"strings"
	"testing"
)

func TestNewHotkeyManagerReturnsNonNil(t *testing.T) {
	mgr := NewHotkeyManager()
	if mgr == nil {
		t.Fatal("NewHotkeyManager() returned nil")
	}
}

func TestHotkeyStopBeforeStartReturnsNil(t *testing.T) {
	mgr := NewHotkeyManager()
	if err := mgr.Stop(); err != nil {
		t.Fatalf("Stop() before Start() returned error: %v", err)
	}
}

func TestHotkeyStartOnHeadlessOrCI(t *testing.T) {
	// On headless Linux / CI there is no display server, so Register()
	// will fail. This test verifies the error is surfaced correctly
	// rather than panicking or silently failing.
	mgr := NewHotkeyManager()
	err := mgr.Start(context.Background())

	if err == nil {
		// If it succeeded, we have a display — verify Stop works too
		if stopErr := mgr.Stop(); stopErr != nil {
			t.Fatalf("Stop() after successful Start() returned error: %v", stopErr)
		}
		return
	}

	// On headless Linux we expect a meaningful error
	if !strings.Contains(err.Error(), "hotkey") {
		t.Fatalf("Start() error = %q, want error mentioning 'hotkey'", err.Error())
	}

	// Stop() after a failed Start must also be safe
	if err := mgr.Stop(); err != nil {
		t.Fatalf("Stop() after failed Start() returned error: %v", err)
	}
}

func TestHotkeyDoubleStart(t *testing.T) {
	mgr := NewHotkeyManager()
	_ = mgr.Start(context.Background()) // first start — may fail on headless
	// Second start: should overwrite the hotkey without panic
	err := mgr.Start(context.Background())
	if err != nil {
		if !strings.Contains(err.Error(), "hotkey") {
			t.Fatalf("second Start() error = %q, want 'hotkey' in message", err.Error())
		}
	}
}
