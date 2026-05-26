package backend

// #cgo CFLAGS: -x objective-c
// #cgo LDFLAGS: -framework Cocoa
// #include <stdlib.h>
// void initStatusItem(const char *iconBytes, int iconLen);
// void removeStatusItem(void);
import "C"
import (
	"context"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// gTrayActions receives action IDs from the Objective-C menu callbacks.
// Buffered so the Cocoa main thread never blocks on send.
var gTrayActions = make(chan int, 4)

//export onTrayAction
func onTrayAction(action C.int) {
	select {
	case gTrayActions <- int(action):
	default:
	}
}

type SystrayManager struct {
	ctx  context.Context
	icon []byte
	done chan struct{}
}

func NewSystrayManager(icon []byte) *SystrayManager {
	return &SystrayManager{icon: icon, done: make(chan struct{})}
}

func (s *SystrayManager) Start(ctx context.Context) error {
	s.ctx = ctx
	go s.processActions()

	if len(s.icon) > 0 {
		iconPtr := C.CBytes(s.icon)
		// dispatch_sync inside initStatusItem blocks until the main thread
		// finishes setting up the NSStatusItem, so iconPtr is valid throughout.
		C.initStatusItem((*C.char)(iconPtr), C.int(len(s.icon)))
		C.free(unsafe.Pointer(iconPtr))
	}
	return nil
}

func (s *SystrayManager) processActions() {
	for {
		select {
		case action := <-gTrayActions:
			if s.ctx == nil {
				continue
			}
			switch action {
			case 0:
				runtime.WindowShow(s.ctx)
			case 1:
				runtime.Quit(s.ctx)
			}
		case <-s.done:
			return
		}
	}
}

func (s *SystrayManager) Stop() {
	C.removeStatusItem()
	select {
	case <-s.done:
	default:
		close(s.done)
	}
}

func (s *SystrayManager) ShowWindow() {
	if s.ctx != nil {
		runtime.WindowShow(s.ctx)
	}
}
