package backend

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/argon2"
)

const secureNoteVersion byte = 1

type vaultConfig struct {
	SecureSalt string `json:"secureSalt,omitempty"`
}

type SecureVaultManager struct {
	mu       sync.Mutex
	unlocked map[string][]byte
}

func NewSecureVaultManager() *SecureVaultManager {
	return &SecureVaultManager{
		unlocked: make(map[string][]byte),
	}
}

func (m *SecureVaultManager) UnlockSecure(root string, password string) error {
	salt, err := loadOrCreateSecureSalt(root)
	if err != nil {
		return err
	}
	key := deriveSecureKey(password, salt)

	m.mu.Lock()
	m.unlocked[secureRootKey(root)] = key
	m.mu.Unlock()

	return nil
}

func (m *SecureVaultManager) EncryptNote(root string, relPath string, plaintext string) error {
	key, err := m.keyForRoot(root)
	if err != nil {
		return err
	}
	targetRelPath := SecureNoteTargetPath(relPath)
	targetPath, err := SafeVaultPath(root, targetRelPath)
	if err != nil {
		return err
	}

	ciphertext, err := encryptSecurePayload(key, []byte(plaintext))
	if err != nil {
		return err
	}
	if err := atomicWriteFile(targetPath, ciphertext); err != nil {
		return err
	}

	if cleanSource := plainNoteSourcePath(relPath); cleanSource != "" && cleanSource != relPath && !strings.HasSuffix(relPath, ".md.sec") {
		sourcePath, err := SafeVaultPath(root, cleanSource)
		if err != nil {
			return err
		}
		if err := os.Remove(sourcePath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}

	return nil
}

func (m *SecureVaultManager) DecryptNote(root string, relPath string) (string, error) {
	key, err := m.keyForRoot(root)
	if err != nil {
		return "", err
	}
	path, err := SafeVaultPath(root, relPath)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	plaintext, err := decryptSecurePayload(key, data)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (m *SecureVaultManager) ChangeSecurePassword(root string, oldPassword string, newPassword string) error {
	salt, err := loadOrCreateSecureSalt(root)
	if err != nil {
		return err
	}
	currentKey := deriveSecureKey(oldPassword, salt)
	nextKey := deriveSecureKey(newPassword, salt)

	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.unlocked[secureRootKey(root)]; ok && !bytesEqual(existing, currentKey) {
		return fmt.Errorf("secure vault password does not match current unlocked key")
	}
	m.unlocked[secureRootKey(root)] = nextKey
	return nil
}

func (m *SecureVaultManager) keyForRoot(root string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key, ok := m.unlocked[secureRootKey(root)]
	if !ok {
		return nil, fmt.Errorf("secure vault is locked")
	}
	return key, nil
}

func secureRootKey(root string) string {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return root
	}
	return absRoot
}

func loadOrCreateSecureSalt(root string) ([]byte, error) {
	configPath, err := SafeVaultPath(root, ".app/config.json")
	if err != nil {
		return nil, err
	}

	cfg := vaultConfig{}
	data, err := os.ReadFile(configPath)
	if err == nil {
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	if strings.TrimSpace(cfg.SecureSalt) == "" {
		salt := make([]byte, 16)
		if _, err := rand.Read(salt); err != nil {
			return nil, err
		}
		cfg.SecureSalt = base64.StdEncoding.EncodeToString(salt)
		if err := writeVaultConfig(configPath, cfg); err != nil {
			return nil, err
		}
		return salt, nil
	}

	salt, err := base64.StdEncoding.DecodeString(cfg.SecureSalt)
	if err != nil {
		return nil, err
	}
	return salt, nil
}

func writeVaultConfig(configPath string, cfg vaultConfig) error {
	encoded, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(configPath, append(encoded, '\n'))
}

func deriveSecureKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
}

func encryptSecurePayload(key []byte, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	sealed := gcm.Seal(nil, nonce, plaintext, nil)
	payload := make([]byte, 0, 1+len(nonce)+len(sealed))
	payload = append(payload, secureNoteVersion)
	payload = append(payload, nonce...)
	payload = append(payload, sealed...)
	return payload, nil
}

func decryptSecurePayload(key []byte, payload []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(payload) < 1+gcm.NonceSize() {
		return nil, fmt.Errorf("secure note payload is truncated")
	}
	if payload[0] != secureNoteVersion {
		return nil, fmt.Errorf("unsupported secure note version %d", payload[0])
	}
	nonce := payload[1 : 1+gcm.NonceSize()]
	ciphertext := payload[1+gcm.NonceSize():]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func SecureNoteTargetPath(relPath string) string {
	switch {
	case strings.HasSuffix(relPath, ".md.sec"):
		return relPath
	case strings.HasSuffix(relPath, ".md"), strings.HasSuffix(relPath, ".txt"):
		return relPath + ".sec"
	default:
		return relPath + ".sec"
	}
}

func plainNoteSourcePath(relPath string) string {
	switch {
	case strings.HasSuffix(relPath, ".md.sec"):
		return strings.TrimSuffix(relPath, ".sec")
	case strings.HasSuffix(relPath, ".sec"):
		return strings.TrimSuffix(relPath, ".sec")
	default:
		return relPath
	}
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
