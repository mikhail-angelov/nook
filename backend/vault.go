package backend

import (
	"os"
	"path/filepath"
	"sort"
)

func ScanVault(root string) ([]ScannedNote, error) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	var notes []ScannedNote
	err = filepath.Walk(rootAbs, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		relPath, err := relativeVaultPath(rootAbs, path)
		if err != nil || !isSupportedNotePath(relPath) {
			return nil
		}
		note, err := scanNoteFile(rootAbs, path)
		if err != nil {
			return err
		}
		notes = append(notes, note)
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(notes, func(i, j int) bool {
		return notes[i].ID < notes[j].ID
	})
	return notes, nil
}

func ReadFile(root string, relPath string) (string, error) {
	path, err := SafeVaultPath(root, relPath)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func WriteFile(root string, relPath string, contents string) (int64, error) {
	path, err := SafeVaultPath(root, relPath)
	if err != nil {
		return 0, err
	}
	if err := atomicWriteFile(path, []byte(contents)); err != nil {
		return 0, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return info.ModTime().Unix(), nil
}

func DeleteFile(root string, relPath string) error {
	path, err := SafeVaultPath(root, relPath)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func RenameFile(root string, oldRelPath string, newRelPath string) (ScannedNote, error) {
	oldPath, err := SafeVaultPath(root, oldRelPath)
	if err != nil {
		return ScannedNote{}, err
	}
	newPath, err := SafeVaultPath(root, newRelPath)
	if err != nil {
		return ScannedNote{}, err
	}
	if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
		return ScannedNote{}, err
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return ScannedNote{}, err
	}
	return scanNoteFile(root, newPath)
}

func scanNoteFile(root string, path string) (ScannedNote, error) {
	info, err := os.Stat(path)
	if err != nil {
		return ScannedNote{}, err
	}
	relPath, err := relativeVaultPath(root, path)
	if err != nil {
		return ScannedNote{}, err
	}

	note := ScannedNote{
		ID:        relPath,
		Path:      relPath,
		Title:     filenameStem(relPath),
		IsSecure:  filepath.Ext(path) == ".sec",
		Mtime:     info.ModTime().Unix(),
		CreatedAt: info.ModTime().Unix(),
		Tags:      []string{},
		Wikilinks: []string{},
	}
	if note.IsSecure {
		return note, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return ScannedNote{}, err
	}
	parsed := ParseNote(string(data), relPath)
	note.Title = parsed.Title
	note.Body = stringPtr(parsed.Body)
	note.Tags = parsed.Tags
	note.Wikilinks = parsed.Wikilinks
	return note, nil
}

func stringPtr(value string) *string {
	return &value
}
