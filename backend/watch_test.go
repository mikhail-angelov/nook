package backend

import (
	"path/filepath"
	"testing"

	"github.com/fsnotify/fsnotify"
)

func TestEventNormalizerNormalizesStablePayloads(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "vault")
	normalizer := NewEventNormalizer(root)

	events := normalizer.Normalize(fsnotify.Event{
		Name: filepath.Join(root, "notes", "alpha.md"),
		Op:   fsnotify.Create,
	})
	assertPathEvent(t, events, 0, "Created", "notes/alpha.md")

	events = normalizer.Normalize(fsnotify.Event{
		Name: filepath.Join(root, "notes", "alpha.md"),
		Op:   fsnotify.Write,
	})
	assertPathEvent(t, events, 0, "Modified", "notes/alpha.md")

	events = normalizer.Normalize(fsnotify.Event{
		Name: filepath.Join(root, "notes", "alpha.md"),
		Op:   fsnotify.Rename,
	})
	if len(events) != 0 {
		t.Fatalf("rename prelude events = %#v, want none until create arrives", events)
	}

	events = normalizer.Normalize(fsnotify.Event{
		Name: filepath.Join(root, "notes", "beta.md"),
		Op:   fsnotify.Create,
	})
	if len(events) != 1 {
		t.Fatalf("rename completion events = %#v, want 1 event", events)
	}
	if events[0].Kind != "Renamed" {
		t.Fatalf("rename completion kind = %q, want Renamed", events[0].Kind)
	}
	data, ok := events[0].Data.(RenameData)
	if !ok {
		t.Fatalf("rename completion data type = %T, want RenameData", events[0].Data)
	}
	if data.From != "notes/alpha.md" || data.To != "notes/beta.md" {
		t.Fatalf("rename completion data = %#v", data)
	}

	events = normalizer.Normalize(fsnotify.Event{
		Name: filepath.Join(root, "notes", "beta.md"),
		Op:   fsnotify.Remove,
	})
	assertPathEvent(t, events, 0, "Deleted", "notes/beta.md")
}

func assertPathEvent(t *testing.T, events []VaultEvent, index int, kind string, path string) {
	t.Helper()
	if len(events) <= index {
		t.Fatalf("events length = %d, want index %d present", len(events), index)
	}
	if events[index].Kind != kind {
		t.Fatalf("event kind = %q, want %q", events[index].Kind, kind)
	}
	data, ok := events[index].Data.(string)
	if !ok {
		t.Fatalf("event data type = %T, want string", events[index].Data)
	}
	if data != path {
		t.Fatalf("event data = %q, want %q", data, path)
	}
}
