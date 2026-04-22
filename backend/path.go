package backend

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var ErrPathEscape = errors.New("path escapes vault root")

func SafeVaultPath(root string, relPath string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", fmt.Errorf("vault root is required")
	}
	if strings.TrimSpace(relPath) == "" {
		return "", fmt.Errorf("vault path is required")
	}
	if filepath.IsAbs(relPath) {
		return "", fmt.Errorf("%w: absolute paths are not allowed", ErrPathEscape)
	}

	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	cleanRel := filepath.Clean(filepath.FromSlash(relPath))
	target := filepath.Join(rootAbs, cleanRel)
	relative, err := filepath.Rel(rootAbs, target)
	if err != nil {
		return "", err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("%w: %s", ErrPathEscape, relPath)
	}

	return target, nil
}

func relativeVaultPath(root string, absPath string) (string, error) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(absPath)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(rootAbs, targetAbs)
	if err != nil {
		return "", err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("%w: %s", ErrPathEscape, absPath)
	}
	return filepath.ToSlash(relative), nil
}

func isSupportedNotePath(relPath string) bool {
	return strings.HasSuffix(relPath, ".md") || strings.HasSuffix(relPath, ".txt") || strings.HasSuffix(relPath, ".md.sec")
}

func filenameStem(relPath string) string {
	base := filepath.Base(relPath)
	switch {
	case strings.HasSuffix(base, ".md.sec"):
		return strings.TrimSuffix(base, ".md.sec")
	case strings.HasSuffix(base, ".md"):
		return strings.TrimSuffix(base, ".md")
	case strings.HasSuffix(base, ".txt"):
		return strings.TrimSuffix(base, ".txt")
	default:
		return base
	}
}
