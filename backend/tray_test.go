package backend

import (
	"context"
	"testing"
)

func TestNewSystrayManager(t *testing.T) {
	mgr := NewSystrayManager(nil)
	if mgr == nil {
		t.Fatal("NewSystrayManager() returned nil")
	}
}

func TestSystrayManagerStartStop(t *testing.T) {
	mgr := NewSystrayManager(nil)
	if err := mgr.Start(context.Background()); err != nil {
		t.Fatalf("Start() returned error: %v", err)
	}
	// Should not panic on stop
	mgr.Stop()
	// Double stop should also be safe
	mgr.Stop()
}

func TestSystrayManagerShowWindowBeforeStart(t *testing.T) {
	mgr := NewSystrayManager(nil)
	// ShowWindow before Start should not panic
	mgr.ShowWindow()
}
