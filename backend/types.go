package backend

type ScannedNote struct {
	ID        string   `json:"id"`
	Path      string   `json:"path"`
	Title     string   `json:"title"`
	Body      *string  `json:"body"`
	IsSecure  bool     `json:"is_secure"`
	Mtime     int64    `json:"mtime"`
	CreatedAt int64    `json:"created_at"`
	Tags      []string `json:"tags"`
	Wikilinks []string `json:"wikilinks"`
}

type RenameData struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type VaultEvent struct {
	Kind string      `json:"kind"`
	Data interface{} `json:"data"`
}
