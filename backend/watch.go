package backend

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

const (
	defaultWatchDebounce   = 5 * time.Second
	defaultSelfWriteWindow = 2 * time.Second
)

type EventNormalizer struct {
	mu            sync.Mutex
	root          string
	pendingRename string
}

func NewEventNormalizer(root string) *EventNormalizer {
	rootAbs, _ := filepath.Abs(root)
	return &EventNormalizer{root: rootAbs}
}

func (n *EventNormalizer) Normalize(event fsnotify.Event) []VaultEvent {
	n.mu.Lock()
	defer n.mu.Unlock()

	relPath, err := relativeVaultPath(n.root, event.Name)
	if err != nil {
		return nil
	}

	switch {
	case event.Op&fsnotify.Rename != 0:
		if isSupportedNotePath(relPath) {
			n.pendingRename = relPath
		} else {
			n.pendingRename = ""
		}
		return nil
	case event.Op&fsnotify.Create != 0:
		if n.pendingRename != "" && isSupportedNotePath(relPath) {
			from := n.pendingRename
			n.pendingRename = ""
			if from != relPath {
				return []VaultEvent{{Kind: "Renamed", Data: RenameData{From: from, To: relPath}}}
			}
		}
		n.pendingRename = ""
		if isSupportedNotePath(relPath) {
			return []VaultEvent{{Kind: "Created", Data: relPath}}
		}
	case event.Op&(fsnotify.Write|fsnotify.Chmod) != 0:
		if isSupportedNotePath(relPath) {
			return []VaultEvent{{Kind: "Modified", Data: relPath}}
		}
	case event.Op&fsnotify.Remove != 0:
		if isSupportedNotePath(relPath) {
			return []VaultEvent{{Kind: "Deleted", Data: relPath}}
		}
	}
	return nil
}

type WatcherManager struct {
	mu            sync.Mutex
	watcher       *fsnotify.Watcher
	root          string
	done          chan struct{}
	emit          func(VaultEvent)
	normalizer    *EventNormalizer
	debounce      time.Duration
	selfWriteTTL  time.Duration
	pendingTimers map[string]*time.Timer
	recentSelfOps map[string]time.Time
}

func NewWatcherManager(emit func(VaultEvent)) *WatcherManager {
	return &WatcherManager{
		emit:          emit,
		debounce:      defaultWatchDebounce,
		selfWriteTTL:  defaultSelfWriteWindow,
		pendingTimers: make(map[string]*time.Timer),
		recentSelfOps: make(map[string]time.Time),
	}
}

func (w *WatcherManager) Start(root string) error {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err := addRecursiveWatches(watcher, rootAbs); err != nil {
		watcher.Close()
		return err
	}

	w.mu.Lock()
	w.stopLocked()
	w.watcher = watcher
	w.root = rootAbs
	w.done = make(chan struct{})
	w.normalizer = NewEventNormalizer(rootAbs)
	done := w.done
	w.mu.Unlock()

	go w.loop(watcher, done, rootAbs)
	return nil
}

func (w *WatcherManager) Stop() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.stopLocked()
}

func (w *WatcherManager) TagSelf(relPaths ...string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	expiresAt := time.Now().Add(w.selfWriteTTL)
	for _, relPath := range relPaths {
		if relPath == "" {
			continue
		}
		w.recentSelfOps[filepath.ToSlash(relPath)] = expiresAt
	}
}

func (w *WatcherManager) loop(watcher *fsnotify.Watcher, done <-chan struct{}, root string) {
	for {
		select {
		case <-done:
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			w.handleFsEvent(watcher, root, event)
		case _, ok := <-watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

func (w *WatcherManager) handleFsEvent(watcher *fsnotify.Watcher, root string, event fsnotify.Event) {
	if event.Op&fsnotify.Create != 0 {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			_ = addRecursiveWatches(watcher, event.Name)
		}
	}

	w.mu.Lock()
	normalizer := w.normalizer
	w.mu.Unlock()
	if normalizer == nil {
		return
	}

	for _, normalized := range normalizer.Normalize(event) {
		if w.shouldSuppress(normalized) {
			continue
		}
		w.debounceEmit(normalized)
	}
}

func (w *WatcherManager) shouldSuppress(event VaultEvent) bool {
	w.mu.Lock()
	defer w.mu.Unlock()

	now := time.Now()
	for path, expiresAt := range w.recentSelfOps {
		if now.After(expiresAt) {
			delete(w.recentSelfOps, path)
		}
	}
	for _, path := range eventPaths(event) {
		if _, ok := w.recentSelfOps[path]; ok {
			return true
		}
	}
	return false
}

func (w *WatcherManager) debounceEmit(event VaultEvent) {
	key := eventKey(event)

	w.mu.Lock()
	if existing, ok := w.pendingTimers[key]; ok {
		existing.Stop()
	}
	w.pendingTimers[key] = time.AfterFunc(w.debounce, func() {
		w.mu.Lock()
		delete(w.pendingTimers, key)
		emit := w.emit
		w.mu.Unlock()
		if emit != nil {
			emit(event)
		}
	})
	w.mu.Unlock()
}

func (w *WatcherManager) stopLocked() error {
	for key, timer := range w.pendingTimers {
		timer.Stop()
		delete(w.pendingTimers, key)
	}
	w.recentSelfOps = make(map[string]time.Time)
	w.normalizer = nil
	w.root = ""
	if w.done != nil {
		close(w.done)
		w.done = nil
	}
	if w.watcher != nil {
		err := w.watcher.Close()
		w.watcher = nil
		return err
	}
	return nil
}

func addRecursiveWatches(watcher *fsnotify.Watcher, root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return watcher.Add(path)
		}
		return nil
	})
}

func eventPaths(event VaultEvent) []string {
	switch data := event.Data.(type) {
	case string:
		return []string{filepath.ToSlash(data)}
	case RenameData:
		return []string{filepath.ToSlash(data.From), filepath.ToSlash(data.To)}
	default:
		return nil
	}
}

func eventKey(event VaultEvent) string {
	switch data := event.Data.(type) {
	case string:
		return event.Kind + ":" + filepath.ToSlash(data)
	case RenameData:
		return event.Kind + ":" + filepath.ToSlash(data.From) + "->" + filepath.ToSlash(data.To)
	default:
		return event.Kind
	}
}
