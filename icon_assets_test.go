package main

import (
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildIconAssetsExist(t *testing.T) {
	t.Helper()

	root := "."
	svgPath := filepath.Join(root, "assets", "icons", "appicon.svg")
	pngPath := filepath.Join(root, "assets", "icons", "appicon.png")
	icoPath := filepath.Join(root, "assets", "icons", "windows", "icon.ico")
	if _, err := os.Stat(svgPath); err != nil {
		t.Fatalf("expected source icon asset at %s: %v", svgPath, err)
	}

	file, err := os.Open(pngPath)
	if err != nil {
		t.Fatalf("expected PNG app icon at %s: %v", pngPath, err)
	}
	defer file.Close()

	cfg, _, err := image.DecodeConfig(file)
	if err != nil {
		t.Fatalf("decode png config: %v", err)
	}

	if cfg.Width != 1024 || cfg.Height != 1024 {
		t.Fatalf("expected 1024x1024 appicon.png, got %dx%d", cfg.Width, cfg.Height)
	}

	ico, err := os.ReadFile(icoPath)
	if err != nil {
		t.Fatalf("expected Windows icon at %s: %v", icoPath, err)
	}

	if len(ico) < 4 || ico[0] != 0 || ico[1] != 0 || ico[2] != 1 || ico[3] != 0 {
		t.Fatalf("expected valid ICO header in %s", icoPath)
	}
}
