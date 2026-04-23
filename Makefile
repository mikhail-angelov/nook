RAYCAST_SCRIPT_DIR ?=
RAYCAST_NOOK_SCRIPT := open-nook.sh

build:
	mkdir -p build/windows
	cp assets/icons/appicon.png build/appicon.png
	cp assets/icons/windows/icon.ico build/windows/icon.ico
	wails build

install-macos: build
	cp -r build/bin/nook.app /Applications/
	codesign --force --deep --sign - /Applications/nook.app

install-raycast-script:
	@if [ -z "$(RAYCAST_SCRIPT_DIR)" ]; then \
		echo "Set RAYCAST_SCRIPT_DIR to your Raycast Script Commands directory."; \
		echo "Example: make install-raycast-script RAYCAST_SCRIPT_DIR=\"$$HOME/raycast-scripts\""; \
		exit 1; \
	fi
	mkdir -p "$(RAYCAST_SCRIPT_DIR)"
	cp scripts/raycast/$(RAYCAST_NOOK_SCRIPT) "$(RAYCAST_SCRIPT_DIR)/$(RAYCAST_NOOK_SCRIPT)"
	chmod +x "$(RAYCAST_SCRIPT_DIR)/$(RAYCAST_NOOK_SCRIPT)"
	@echo "Installed Raycast command to $(RAYCAST_SCRIPT_DIR)/$(RAYCAST_NOOK_SCRIPT)"
	@echo "In Raycast, add that directory as a Script Directory if needed, then assign a hotkey to 'Open Nook'."
