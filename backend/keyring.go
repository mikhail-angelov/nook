package backend

import (
	"sort"
	"strings"
	"sync"

	keyring "github.com/zalando/go-keyring"
)

const (
	providerKeyringService      = "nook.ai"
	providerKeyringRecordPrefix = "provider.apiKey"
	providerKeyringListAccount  = "__providers"
)

type providerKeyring interface {
	Set(service, user, password string) error
	Get(service, user string) (string, error)
	Delete(service, user string) error
}

type keyringStore struct{}

func (keyringStore) Set(service, user, password string) error {
	return keyring.Set(service, user, password)
}

func (keyringStore) Get(service, user string) (string, error) {
	return keyring.Get(service, user)
}

func (keyringStore) Delete(service, user string) error {
	return keyring.Delete(service, user)
}

var (
	providerKeyringMu     sync.Mutex
	providerKeyringClient providerKeyring = keyringStore{}
)

func SetProviderKeyringClient(client providerKeyring) {
	providerKeyringMu.Lock()
	defer providerKeyringMu.Unlock()
	if client == nil {
		providerKeyringClient = keyringStore{}
		return
	}
	providerKeyringClient = client
}

func ProviderApiKeyLoad(providerId string) (*string, error) {
	providerKeyringMu.Lock()
	defer providerKeyringMu.Unlock()

	value, err := providerKeyringClient.Get(providerKeyringService, providerRecordName(providerId))
	if err != nil {
		return nil, nil
	}
	return &value, nil
}

func ProviderApiKeySave(providerId string, apiKey string) error {
	providerKeyringMu.Lock()
	defer providerKeyringMu.Unlock()

	if err := providerKeyringClient.Set(providerKeyringService, providerRecordName(providerId), apiKey); err != nil {
		return err
	}
	return providerKeyringClient.Set(providerKeyringService, providerKeyringListAccount, joinProviderIds(append(loadProviderIdsLocked(), providerId)))
}

func ProviderApiKeyDelete(providerId string) error {
	providerKeyringMu.Lock()
	defer providerKeyringMu.Unlock()

	_ = providerKeyringClient.Delete(providerKeyringService, providerRecordName(providerId))
	return providerKeyringClient.Set(providerKeyringService, providerKeyringListAccount, joinProviderIds(removeProviderId(loadProviderIdsLocked(), providerId)))
}

func ProviderApiKeyList() ([]string, error) {
	providerKeyringMu.Lock()
	defer providerKeyringMu.Unlock()

	return loadProviderIdsLocked(), nil
}

func providerRecordName(providerId string) string {
	return providerKeyringRecordPrefix + "." + providerId
}

func loadProviderIdsLocked() []string {
	raw, err := providerKeyringClient.Get(providerKeyringService, providerKeyringListAccount)
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, "\n")
	seen := make(map[string]struct{}, len(parts))
	ids := make([]string, 0, len(parts))
	for _, part := range parts {
		id := strings.TrimSpace(part)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func joinProviderIds(ids []string) string {
	if len(ids) == 0 {
		return ""
	}
	sort.Strings(ids)
	uniq := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	return strings.Join(uniq, "\n")
}

func removeProviderId(ids []string, providerId string) []string {
	if len(ids) == 0 {
		return nil
	}
	filtered := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != providerId {
			filtered = append(filtered, id)
		}
	}
	return filtered
}
