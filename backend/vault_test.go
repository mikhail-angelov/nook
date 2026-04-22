package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanVaultParsesMarkdownRecursively(t *testing.T) {
	root := t.TempDir()

	mustWriteTestFile(t, filepath.Join(root, "notes", "daily", "entry.md"), "---\n"+
		"title: Morning note\n"+
		"tags:\n"+
		"  - work\n"+
		"  - planning\n"+
		"---\n"+
		"# Ignored heading\n"+
		"Body with #focus and [[Roadmap|roadmap note]].\n")
	mustWriteTestFile(t, filepath.Join(root, "notes", "plain.txt"), "Plain text body with [[Target]] and #text\n")
	mustWriteTestFile(t, filepath.Join(root, "notes", "secret.md.sec"), "ciphertext")
	mustWriteTestFile(t, filepath.Join(root, "notes", "skip.jpg"), "nope")

	notes, err := ScanVault(root)
	if err != nil {
		t.Fatalf("ScanVault returned error: %v", err)
	}

	if got, want := len(notes), 3; got != want {
		t.Fatalf("ScanVault note count = %d, want %d", got, want)
	}

	byID := make(map[string]ScannedNote, len(notes))
	for _, note := range notes {
		byID[note.ID] = note
	}

	markdown := byID["notes/daily/entry.md"]
	if markdown.Title != "Morning note" {
		t.Fatalf("markdown title = %q, want %q", markdown.Title, "Morning note")
	}
	if markdown.Body == nil || *markdown.Body != "# Ignored heading\nBody with #focus and [[Roadmap|roadmap note]].\n" {
		t.Fatalf("markdown body = %#v", markdown.Body)
	}
	if !equalStrings(markdown.Tags, []string{"work", "planning", "focus"}) {
		t.Fatalf("markdown tags = %#v", markdown.Tags)
	}
	if !equalStrings(markdown.Wikilinks, []string{"Roadmap"}) {
		t.Fatalf("markdown wikilinks = %#v", markdown.Wikilinks)
	}
	if markdown.IsSecure {
		t.Fatalf("markdown note should not be secure")
	}
	if markdown.Mtime == 0 || markdown.CreatedAt == 0 {
		t.Fatalf("markdown times should be populated: %#v", markdown)
	}

	plain := byID["notes/plain.txt"]
	if plain.Title != "plain" {
		t.Fatalf("plain title = %q, want %q", plain.Title, "plain")
	}
	if plain.Body == nil || *plain.Body != "Plain text body with [[Target]] and #text\n" {
		t.Fatalf("plain body = %#v", plain.Body)
	}
	if !equalStrings(plain.Tags, []string{"text"}) {
		t.Fatalf("plain tags = %#v", plain.Tags)
	}
	if !equalStrings(plain.Wikilinks, []string{"Target"}) {
		t.Fatalf("plain wikilinks = %#v", plain.Wikilinks)
	}

	secure := byID["notes/secret.md.sec"]
	if !secure.IsSecure {
		t.Fatalf("secure note should be marked secure")
	}
	if secure.Body != nil {
		t.Fatalf("secure note body = %#v, want nil", secure.Body)
	}
	if secure.Title != "secret" {
		t.Fatalf("secure title = %q, want %q", secure.Title, "secret")
	}
}

func TestVaultReadWriteRenameDeleteHappyPath(t *testing.T) {
	root := t.TempDir()

	mtime, err := WriteFile(root, "notes/new.md", "# Heading\nBody #tag\n")
	if err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	if mtime == 0 {
		t.Fatalf("WriteFile mtime = 0, want populated unix seconds")
	}

	body, err := ReadFile(root, "notes/new.md")
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	if body != "# Heading\nBody #tag\n" {
		t.Fatalf("ReadFile body = %q", body)
	}

	renamed, err := RenameFile(root, "notes/new.md", "notes/archive/renamed.md")
	if err != nil {
		t.Fatalf("RenameFile returned error: %v", err)
	}
	if renamed.ID != "notes/archive/renamed.md" {
		t.Fatalf("RenameFile id = %q", renamed.ID)
	}
	if renamed.Title != "Heading" {
		t.Fatalf("RenameFile title = %q, want %q", renamed.Title, "Heading")
	}

	if _, err := os.Stat(filepath.Join(root, "notes", "new.md")); !os.IsNotExist(err) {
		t.Fatalf("old path still exists or stat failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "notes", "archive", "renamed.md")); err != nil {
		t.Fatalf("renamed file missing: %v", err)
	}

	if err := DeleteFile(root, "notes/archive/renamed.md"); err != nil {
		t.Fatalf("DeleteFile returned error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "notes", "archive", "renamed.md")); !os.IsNotExist(err) {
		t.Fatalf("DeleteFile did not remove file: %v", err)
	}
}

func TestSafeVaultPathRejectsEscape(t *testing.T) {
	root := t.TempDir()

	if _, err := SafeVaultPath(root, "../escape.md"); err == nil {
		t.Fatalf("SafeVaultPath should reject escape path")
	}
}

func mustWriteTestFile(t *testing.T, path string, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q) failed: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("WriteFile(%q) failed: %v", path, err)
	}
}

func equalStrings(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
