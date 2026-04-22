package backend

import (
	"errors"
	"reflect"
	"testing"
)

type fakeProviderKeyring struct {
	values map[string]string
}

func (f *fakeProviderKeyring) Set(service, user, password string) error {
	if f.values == nil {
		f.values = make(map[string]string)
	}
	f.values[service+"|"+user] = password
	return nil
}

func (f *fakeProviderKeyring) Get(service, user string) (string, error) {
	if f.values == nil {
		return "", errors.New("not found")
	}
	value, ok := f.values[service+"|"+user]
	if !ok {
		return "", errors.New("not found")
	}
	return value, nil
}

func (f *fakeProviderKeyring) Delete(service, user string) error {
	if f.values != nil {
		delete(f.values, service+"|"+user)
	}
	return nil
}

func TestProviderApiKeySaveLoadDeleteList(t *testing.T) {
	fake := &fakeProviderKeyring{}
	SetProviderKeyringClient(fake)
	t.Cleanup(func() {
		SetProviderKeyringClient(nil)
	})

	if err := ProviderApiKeySave("openai", "openai-key"); err != nil {
		t.Fatalf("ProviderApiKeySave returned error: %v", err)
	}
	if err := ProviderApiKeySave("anthropic", "anthropic-key"); err != nil {
		t.Fatalf("ProviderApiKeySave returned error: %v", err)
	}

	loaded, err := ProviderApiKeyLoad("openai")
	if err != nil {
		t.Fatalf("ProviderApiKeyLoad returned error: %v", err)
	}
	if loaded == nil || *loaded != "openai-key" {
		t.Fatalf("ProviderApiKeyLoad = %#v, want openai-key", loaded)
	}

	list, err := ProviderApiKeyList()
	if err != nil {
		t.Fatalf("ProviderApiKeyList returned error: %v", err)
	}
	if !reflect.DeepEqual(list, []string{"anthropic", "openai"}) {
		t.Fatalf("ProviderApiKeyList = %#v, want [anthropic openai]", list)
	}

	if err := ProviderApiKeyDelete("openai"); err != nil {
		t.Fatalf("ProviderApiKeyDelete returned error: %v", err)
	}
	loaded, err = ProviderApiKeyLoad("openai")
	if err != nil {
		t.Fatalf("ProviderApiKeyLoad after delete returned error: %v", err)
	}
	if loaded != nil {
		t.Fatalf("ProviderApiKeyLoad after delete = %#v, want nil", loaded)
	}
}
