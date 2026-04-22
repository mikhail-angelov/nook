package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSecureVaultUnlockEncryptDecryptHappyPath(t *testing.T) {
	root := t.TempDir()
	manager := NewSecureVaultManager()

	if err := manager.UnlockSecure(root, "vault-password"); err != nil {
		t.Fatalf("UnlockSecure returned error: %v", err)
	}

	if err := manager.EncryptNote(root, "notes/secret.md.sec", "secret body\n"); err != nil {
		t.Fatalf("EncryptNote returned error: %v", err)
	}

	ciphertext, err := os.ReadFile(filepath.Join(root, "notes", "secret.md.sec"))
	if err != nil {
		t.Fatalf("secure note missing after encrypt: %v", err)
	}
	if string(ciphertext) == "secret body\n" {
		t.Fatalf("secure note should not remain plaintext")
	}

	plaintext, err := manager.DecryptNote(root, "notes/secret.md.sec")
	if err != nil {
		t.Fatalf("DecryptNote returned error: %v", err)
	}
	if plaintext != "secret body\n" {
		t.Fatalf("DecryptNote plaintext = %q, want %q", plaintext, "secret body\n")
	}

	second := NewSecureVaultManager()
	if _, err := second.DecryptNote(root, "notes/secret.md.sec"); err == nil {
		t.Fatalf("DecryptNote should require unlock on a fresh manager")
	}
	if err := second.UnlockSecure(root, "vault-password"); err != nil {
		t.Fatalf("UnlockSecure on fresh manager returned error: %v", err)
	}
	plaintext, err = second.DecryptNote(root, "notes/secret.md.sec")
	if err != nil {
		t.Fatalf("DecryptNote after unlock returned error: %v", err)
	}
	if plaintext != "secret body\n" {
		t.Fatalf("DecryptNote after unlock = %q, want %q", plaintext, "secret body\n")
	}
}

