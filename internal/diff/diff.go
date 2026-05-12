// Package diff parses unified `git diff` output into the JSON shape consumed
// by the frontend.
package diff

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Diff is the top-level response shape returned by /api/diff.
type Diff struct {
	Staged bool   `json:"staged"`
	Files  []File `json:"files"`
}

// File describes a single file changed by the diff.
type File struct {
	Path    string `json:"path"`
	OldPath string `json:"old_path"`
	Status  string `json:"status"`
	Binary  bool   `json:"binary,omitempty"`
	Hunks   []Hunk `json:"hunks"`
}

// Hunk is one @@-delimited block of changes within a file.
type Hunk struct {
	OldStart int    `json:"old_start"`
	OldLines int    `json:"old_lines"`
	NewStart int    `json:"new_start"`
	NewLines int    `json:"new_lines"`
	Lines    []Line `json:"lines"`
}

// Line is one line within a hunk. Old and New are nil where the line does not
// exist on that side (insert has no Old, delete has no New).
type Line struct {
	Type    string `json:"type"`
	Old     *int   `json:"old"`
	New     *int   `json:"new"`
	Content string `json:"content"`
}

// Status values used in File.Status.
const (
	StatusModified = "modified"
	StatusAdded    = "added"
	StatusDeleted  = "deleted"
	StatusRenamed  = "renamed"
	StatusCopied   = "copied"
)

var hunkHeaderRE = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

// Parse parses the textual output of `git diff --no-color` into a slice of
// File entries. An empty input yields an empty (non-nil) slice.
func Parse(text string) ([]File, error) {
	files := []File{}
	if text == "" {
		return files, nil
	}
	lines := strings.Split(text, "\n")
	// git output ends with a newline; drop the trailing empty element so we
	// don't mistake it for a real diff line.
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	i := 0
	for i < len(lines) {
		if !strings.HasPrefix(lines[i], "diff --git ") {
			return nil, fmt.Errorf("diff: unexpected line %d: %q", i+1, lines[i])
		}
		f, n, err := parseFile(lines[i:])
		if err != nil {
			return nil, err
		}
		files = append(files, f)
		i += n
	}
	return files, nil
}

func parseFile(lines []string) (File, int, error) {
	f := File{Hunks: []Hunk{}, Status: StatusModified}

	aPath, bPath, ok := parseDiffHeader(lines[0])
	if !ok {
		return f, 0, fmt.Errorf("diff: malformed file header: %q", lines[0])
	}
	f.OldPath = aPath
	f.Path = bPath

	i := 1
	for i < len(lines) {
		line := lines[i]
		switch {
		case strings.HasPrefix(line, "diff --git "):
			return f, i, nil
		case strings.HasPrefix(line, "new file mode "):
			f.Status = StatusAdded
			i++
		case strings.HasPrefix(line, "deleted file mode "):
			f.Status = StatusDeleted
			i++
		case strings.HasPrefix(line, "rename from "):
			f.Status = StatusRenamed
			f.OldPath = strings.TrimPrefix(line, "rename from ")
			i++
		case strings.HasPrefix(line, "rename to "):
			f.Status = StatusRenamed
			f.Path = strings.TrimPrefix(line, "rename to ")
			i++
		case strings.HasPrefix(line, "copy from "):
			f.Status = StatusCopied
			f.OldPath = strings.TrimPrefix(line, "copy from ")
			i++
		case strings.HasPrefix(line, "copy to "):
			f.Status = StatusCopied
			f.Path = strings.TrimPrefix(line, "copy to ")
			i++
		case strings.HasPrefix(line, "Binary files "):
			f.Binary = true
			i++
		case strings.HasPrefix(line, "GIT binary patch"):
			f.Binary = true
			i++
			for i < len(lines) && !strings.HasPrefix(lines[i], "diff --git ") {
				i++
			}
		case strings.HasPrefix(line, "--- "):
			n, err := parseFileBody(&f, lines[i:])
			if err != nil {
				return f, 0, err
			}
			i += n
		default:
			// index, similarity index, mode-only changes — informational, skip.
			i++
		}
	}
	normalizePaths(&f)
	return f, i, nil
}

// parseFileBody handles the --- / +++ pair followed by zero or more hunks.
func parseFileBody(f *File, lines []string) (int, error) {
	old := strings.TrimPrefix(lines[0], "--- ")
	if old == "/dev/null" {
		f.Status = StatusAdded
	} else if f.Status != StatusRenamed && f.Status != StatusCopied {
		f.OldPath = strings.TrimPrefix(old, "a/")
	}
	if len(lines) < 2 || !strings.HasPrefix(lines[1], "+++ ") {
		return 0, fmt.Errorf("diff: expected +++ after ---")
	}
	newp := strings.TrimPrefix(lines[1], "+++ ")
	if newp == "/dev/null" {
		f.Status = StatusDeleted
	} else if f.Status != StatusRenamed && f.Status != StatusCopied {
		f.Path = strings.TrimPrefix(newp, "b/")
	}
	normalizePaths(f)

	i := 2
	for i < len(lines) && strings.HasPrefix(lines[i], "@@") {
		h, n, err := parseHunk(lines[i:])
		if err != nil {
			return 0, err
		}
		f.Hunks = append(f.Hunks, h)
		i += n
	}
	return i, nil
}

// normalizePaths fills in missing path/old_path so both fields are always set
// to a meaningful value, per the SPEC's example.
func normalizePaths(f *File) {
	switch f.Status {
	case StatusAdded:
		f.OldPath = f.Path
	case StatusDeleted:
		f.Path = f.OldPath
	}
}

func parseHunk(lines []string) (Hunk, int, error) {
	h := Hunk{Lines: []Line{}}
	m := hunkHeaderRE.FindStringSubmatch(lines[0])
	if m == nil {
		return h, 0, fmt.Errorf("diff: malformed hunk header: %q", lines[0])
	}
	h.OldStart, _ = strconv.Atoi(m[1])
	h.OldLines = 1
	if m[2] != "" {
		h.OldLines, _ = strconv.Atoi(m[2])
	}
	h.NewStart, _ = strconv.Atoi(m[3])
	h.NewLines = 1
	if m[4] != "" {
		h.NewLines, _ = strconv.Atoi(m[4])
	}

	oldNo, newNo := h.OldStart, h.NewStart
	i := 1
	for i < len(lines) {
		line := lines[i]
		if line == "" {
			break
		}
		if strings.HasPrefix(line, "diff --git ") || strings.HasPrefix(line, "@@") {
			break
		}
		// "\ No newline at end of file" annotates the previous line; ignore it.
		if strings.HasPrefix(line, `\`) {
			i++
			continue
		}
		switch line[0] {
		case ' ':
			o, n := oldNo, newNo
			h.Lines = append(h.Lines, Line{Type: "context", Old: &o, New: &n, Content: line[1:]})
			oldNo++
			newNo++
		case '-':
			o := oldNo
			h.Lines = append(h.Lines, Line{Type: "delete", Old: &o, Content: line[1:]})
			oldNo++
		case '+':
			n := newNo
			h.Lines = append(h.Lines, Line{Type: "insert", New: &n, Content: line[1:]})
			newNo++
		default:
			return h, i, nil
		}
		i++
	}
	return h, i, nil
}

// parseDiffHeader extracts the a/ and b/ paths from a `diff --git` line.
// For paths containing " b/", we prefer the midpoint split (which is correct
// when both paths are equal — the common case).
func parseDiffHeader(line string) (string, string, bool) {
	rest, ok := strings.CutPrefix(line, "diff --git ")
	if !ok || !strings.HasPrefix(rest, "a/") {
		return "", "", false
	}
	n := len(rest)
	if (n-5)%2 == 0 {
		mid := 2 + (n-5)/2
		if mid < n && rest[mid] == ' ' && strings.HasPrefix(rest[mid+1:], "b/") {
			return rest[2:mid], rest[mid+3:], true
		}
	}
	idx := strings.Index(rest, " b/")
	if idx <= 2 {
		return "", "", false
	}
	return rest[2:idx], rest[idx+3:], true
}
