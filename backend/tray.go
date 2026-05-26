//go:build !darwin

package backend

import "context"

// SystrayManager is a no-op on non-macOS platforms.
// Window visibility is managed by the global hotkey and dock icon.
type SystrayManager struct {
	ctx context.Context
}

func NewSystrayManager(_ []byte) *SystrayManager {
	return &SystrayManager{}
}

func (s *SystrayManager) Start(ctx context.Context) error {
	s.ctx = ctx
	return nil
}

func (s *SystrayManager) Stop() {}

func (s *SystrayManager) ShowWindow() {}
