package backend

import (
	"strings"
	"unicode"
)

type parsedNote struct {
	Title     string
	Body      string
	Tags      []string
	Wikilinks []string
}

func ParseNote(raw string, relPath string) parsedNote {
	fmTitle, fmTags, body := splitFrontmatter(raw)
	title := fmTitle
	if title == "" {
		title = firstH1(body)
	}
	if title == "" {
		title = filenameStem(relPath)
	}
	if title == "" {
		title = "Untitled"
	}

	seen := make(map[string]struct{})
	tags := make([]string, 0, len(fmTags))
	for _, tag := range append(fmTags, extractInlineTags(body)...) {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		tags = append(tags, tag)
	}

	return parsedNote{
		Title:     title,
		Body:      body,
		Tags:      tags,
		Wikilinks: extractWikilinks(body),
	}
}

func splitFrontmatter(raw string) (string, []string, string) {
	if !strings.HasPrefix(raw, "---") {
		return "", nil, raw
	}
	normalized := strings.ReplaceAll(raw, "\r\n", "\n")
	if !strings.HasPrefix(normalized, "---\n") {
		return "", nil, raw
	}
	rest := normalized[len("---\n"):]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return "", nil, raw
	}

	yaml := rest[:end]
	body := rest[end+len("\n---"):]
	if strings.HasPrefix(body, "\n") {
		body = body[1:]
	}
	title, tags := parseFrontmatterYAML(yaml)
	return title, tags, body
}

func parseFrontmatterYAML(yaml string) (string, []string) {
	var title string
	var tags []string
	lines := strings.Split(yaml, "\n")

	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimLeft(lines[i], " \t")
		switch {
		case strings.HasPrefix(trimmed, "title:"):
			value := stripYAMLValue(strings.TrimSpace(strings.TrimPrefix(trimmed, "title:")))
			if value != "" {
				title = value
			}
		case strings.HasPrefix(trimmed, "tags:"):
			rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "tags:"))
			switch {
			case rest == "":
				for j := i + 1; j < len(lines); j++ {
					item := strings.TrimLeft(lines[j], " \t")
					if strings.HasPrefix(item, "- ") {
						value := stripYAMLValue(strings.TrimSpace(strings.TrimPrefix(item, "- ")))
						if value != "" {
							tags = append(tags, value)
						}
						i = j
						continue
					}
					if item == "" {
						i = j
						continue
					}
					break
				}
			case strings.HasPrefix(rest, "[") && strings.HasSuffix(rest, "]"):
				inner := strings.TrimSuffix(strings.TrimPrefix(rest, "["), "]")
				for _, part := range strings.Split(inner, ",") {
					value := stripYAMLValue(strings.TrimSpace(part))
					if value != "" {
						tags = append(tags, value)
					}
				}
			default:
				value := stripYAMLValue(rest)
				if value != "" {
					tags = append(tags, value)
				}
			}
		}
	}

	return title, tags
}

func stripYAMLValue(value string) string {
	if len(value) >= 2 {
		if (strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"")) ||
			(strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'")) {
			return value[1 : len(value)-1]
		}
	}
	return value
}

func firstH1(body string) string {
	for _, line := range strings.Split(body, "\n") {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "# ") {
			title := strings.TrimSpace(strings.TrimPrefix(trimmed, "# "))
			if title != "" {
				return title
			}
		}
	}
	return ""
}

func extractInlineTags(body string) []string {
	var tags []string
	runes := []rune(body)
	for i := 0; i < len(runes); i++ {
		if runes[i] != '#' {
			continue
		}
		if i > 0 && !tagBoundary(runes[i-1]) {
			continue
		}
		j := i + 1
		for j < len(runes) && tagChar(runes[j]) {
			j++
		}
		if j <= i+1 {
			continue
		}
		tag := string(runes[i+1 : j])
		if containsLetter(tag) {
			tags = append(tags, tag)
		}
		i = j - 1
	}
	return tags
}

func tagBoundary(r rune) bool {
	switch r {
	case ' ', '\t', '\n', '\r', '(', '[', '{', ',':
		return true
	default:
		return false
	}
}

func tagChar(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' || r == '/'
}

func containsLetter(value string) bool {
	for _, r := range value {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func extractWikilinks(body string) []string {
	var links []string
	for i := 0; i+1 < len(body); i++ {
		if body[i] != '[' || body[i+1] != '[' {
			continue
		}
		closeIndex := strings.Index(body[i+2:], "]]")
		if closeIndex < 0 {
			break
		}
		inner := body[i+2 : i+2+closeIndex]
		if pipe := strings.Index(inner, "|"); pipe >= 0 {
			inner = inner[:pipe]
		}
		target := strings.TrimSpace(inner)
		if target != "" {
			links = append(links, target)
		}
		i += closeIndex + 2
	}
	return links
}
