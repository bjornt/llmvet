package diff

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// ip returns a pointer to n. Test helper for nullable line-number fields.
func ip(n int) *int { return &n }

func TestParse(t *testing.T) {
	cases := []struct {
		name    string
		fixture string // file under testdata/, or "" for inline empty input
		raw     string // overrides fixture when set
		want    []File
	}{
		{
			name: "empty diff",
			raw:  "",
			want: []File{},
		},
		{
			name:    "modified file",
			fixture: "modified.diff",
			want: []File{{
				Path:    "src/foo.txt",
				OldPath: "src/foo.txt",
				Status:  StatusModified,
				Hunks: []Hunk{{
					OldStart: 1, OldLines: 3,
					NewStart: 1, NewLines: 3,
					Lines: []Line{
						{Type: "context", Old: ip(1), New: ip(1), Content: "line one"},
						{Type: "delete", Old: ip(2), Content: "old second"},
						{Type: "insert", New: ip(2), Content: "new second"},
						{Type: "context", Old: ip(3), New: ip(3), Content: "line three"},
					},
				}},
			}},
		},
		{
			name:    "added file",
			fixture: "added.diff",
			want: []File{{
				Path:    "new.txt",
				OldPath: "new.txt",
				Status:  StatusAdded,
				Hunks: []Hunk{{
					OldStart: 0, OldLines: 0,
					NewStart: 1, NewLines: 2,
					Lines: []Line{
						{Type: "insert", New: ip(1), Content: "hello"},
						{Type: "insert", New: ip(2), Content: "world"},
					},
				}},
			}},
		},
		{
			name:    "deleted file",
			fixture: "deleted.diff",
			want: []File{{
				Path:    "gone.txt",
				OldPath: "gone.txt",
				Status:  StatusDeleted,
				Hunks: []Hunk{{
					OldStart: 1, OldLines: 2,
					NewStart: 0, NewLines: 0,
					Lines: []Line{
						{Type: "delete", Old: ip(1), Content: "bye"},
						{Type: "delete", Old: ip(2), Content: "world"},
					},
				}},
			}},
		},
		{
			name:    "renamed without changes",
			fixture: "renamed.diff",
			want: []File{{
				Path:    "new.txt",
				OldPath: "old.txt",
				Status:  StatusRenamed,
				Hunks:   []Hunk{},
			}},
		},
		{
			name:    "renamed with content changes",
			fixture: "renamed_modified.diff",
			want: []File{{
				Path:    "new.txt",
				OldPath: "old.txt",
				Status:  StatusRenamed,
				Hunks: []Hunk{{
					OldStart: 1, OldLines: 2,
					NewStart: 1, NewLines: 2,
					Lines: []Line{
						{Type: "context", Old: ip(1), New: ip(1), Content: "keep"},
						{Type: "delete", Old: ip(2), Content: "was"},
						{Type: "insert", New: ip(2), Content: "now"},
					},
				}},
			}},
		},
		{
			name:    "copied file",
			fixture: "copied.diff",
			want: []File{{
				Path:    "dst.txt",
				OldPath: "src.txt",
				Status:  StatusCopied,
				Hunks:   []Hunk{},
			}},
		},
		{
			name:    "binary file",
			fixture: "binary.diff",
			want: []File{{
				Path:    "img.png",
				OldPath: "img.png",
				Status:  StatusModified,
				Binary:  true,
				Hunks:   []Hunk{},
			}},
		},
		{
			name:    "multiple hunks in one file",
			fixture: "multi_hunk.diff",
			want: []File{{
				Path:    "file.txt",
				OldPath: "file.txt",
				Status:  StatusModified,
				Hunks: []Hunk{
					{
						OldStart: 1, OldLines: 3,
						NewStart: 1, NewLines: 3,
						Lines: []Line{
							{Type: "context", Old: ip(1), New: ip(1), Content: "a"},
							{Type: "delete", Old: ip(2), Content: "b"},
							{Type: "insert", New: ip(2), Content: "B"},
							{Type: "context", Old: ip(3), New: ip(3), Content: "c"},
						},
					},
					{
						OldStart: 10, OldLines: 3,
						NewStart: 10, NewLines: 3,
						Lines: []Line{
							{Type: "context", Old: ip(10), New: ip(10), Content: "x"},
							{Type: "delete", Old: ip(11), Content: "y"},
							{Type: "insert", New: ip(11), Content: "Y"},
							{Type: "context", Old: ip(12), New: ip(12), Content: "z"},
						},
					},
				},
			}},
		},
		{
			name:    "multiple files",
			fixture: "multi_file.diff",
			want: []File{
				{
					Path: "a.txt", OldPath: "a.txt", Status: StatusModified,
					Hunks: []Hunk{{
						OldStart: 1, OldLines: 1,
						NewStart: 1, NewLines: 1,
						Lines: []Line{
							{Type: "delete", Old: ip(1), Content: "old"},
							{Type: "insert", New: ip(1), Content: "new"},
						},
					}},
				},
				{
					Path: "b.txt", OldPath: "b.txt", Status: StatusAdded,
					Hunks: []Hunk{{
						OldStart: 0, OldLines: 0,
						NewStart: 1, NewLines: 1,
						Lines: []Line{
							{Type: "insert", New: ip(1), Content: "brand new"},
						},
					}},
				},
			},
		},
		{
			name:    "no newline at end of file marker is skipped",
			fixture: "no_newline.diff",
			want: []File{{
				Path: "no_nl.txt", OldPath: "no_nl.txt", Status: StatusModified,
				Hunks: []Hunk{{
					OldStart: 1, OldLines: 1,
					NewStart: 1, NewLines: 1,
					Lines: []Line{
						{Type: "delete", Old: ip(1), Content: "old"},
						{Type: "insert", New: ip(1), Content: "new"},
					},
				}},
			}},
		},
		{
			name:    "hunk header carries section heading",
			fixture: "section_heading.diff",
			want: []File{{
				Path: "main.go", OldPath: "main.go", Status: StatusModified,
				Hunks: []Hunk{{
					OldStart: 23, OldLines: 6,
					NewStart: 23, NewLines: 7,
					Section: "func main() {",
					Lines: []Line{
						{Type: "context", Old: ip(23), New: ip(23), Content: "\ta := 1"},
						{Type: "context", Old: ip(24), New: ip(24), Content: "\tb := 2"},
						{Type: "context", Old: ip(25), New: ip(25), Content: "\tc := 3"},
						{Type: "insert", New: ip(26), Content: "\td := 4"},
						{Type: "context", Old: ip(26), New: ip(27), Content: "\te := 5"},
						{Type: "context", Old: ip(27), New: ip(28), Content: "\tf := 6"},
					},
				}},
			}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := tc.raw
			if tc.fixture != "" {
				b, err := os.ReadFile(filepath.Join("testdata", tc.fixture))
				if err != nil {
					t.Fatalf("read fixture: %v", err)
				}
				input = string(b)
			}
			got, err := Parse(input)
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				gotJSON, _ := json.MarshalIndent(got, "", "  ")
				wantJSON, _ := json.MarshalIndent(tc.want, "", "  ")
				t.Errorf("mismatch\ngot:\n%s\nwant:\n%s", gotJSON, wantJSON)
			}
		})
	}
}

// TestParseEmptyReturnsNonNil guards the JSON contract: callers should always
// see `"files": []` rather than `"files": null`.
func TestParseEmptyReturnsNonNil(t *testing.T) {
	files, err := Parse("")
	if err != nil {
		t.Fatal(err)
	}
	if files == nil {
		t.Fatal("Parse(\"\") returned nil; want non-nil empty slice")
	}
	b, _ := json.Marshal(Diff{Files: files})
	if got, want := string(b), `{"staged":false,"files":[]}`; got != want {
		t.Errorf("JSON: got %s want %s", got, want)
	}
}

// TestJSONShape locks the field names and null behaviour against SPEC.md.
func TestJSONShape(t *testing.T) {
	d := Diff{
		Staged: false,
		Files: []File{{
			Path: "src/foo.ts", OldPath: "src/foo.ts", Status: "modified",
			Hunks: []Hunk{{
				OldStart: 12, OldLines: 6,
				NewStart: 12, NewLines: 8,
				Lines: []Line{
					{Type: "context", Old: ip(12), New: ip(12), Content: "..."},
					{Type: "delete", Old: ip(13), Content: "..."},
					{Type: "insert", New: ip(13), Content: "..."},
				},
			}},
		}},
	}
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"staged":false,"files":[{"path":"src/foo.ts","old_path":"src/foo.ts","status":"modified","hunks":[{"old_start":12,"old_lines":6,"new_start":12,"new_lines":8,"lines":[{"type":"context","old":12,"new":12,"content":"..."},{"type":"delete","old":13,"new":null,"content":"..."},{"type":"insert","old":null,"new":13,"content":"..."}]}]}]}`
	if string(b) != want {
		t.Errorf("JSON shape mismatch\ngot:  %s\nwant: %s", string(b), want)
	}
}
