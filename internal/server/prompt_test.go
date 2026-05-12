package server

import (
	"strings"
	"testing"
)

func TestFormatPrompt_MatchesSpecExample(t *testing.T) {
	got := FormatPrompt([]Comment{
		{File: "src/foo.ts", Line: 42, Side: "new", Body: "Why not use X here?"},
		{File: "src/bar.go", Line: 108, Side: "old", Body: "This deletion looks unrelated to the task — restore it or explain."},
	})

	want := `The reviewer left the following comments on your changes. Address each one, then re-run the review.

src/foo.ts:42 (added line)
> Why not use X here?

src/bar.go:108 (removed line)
> This deletion looks unrelated to the task — restore it or explain.
`
	if got != want {
		t.Errorf("prompt mismatch.\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestFormatPrompt_NoComments(t *testing.T) {
	got := FormatPrompt(nil)
	if !strings.HasPrefix(got, "The reviewer left the following comments") {
		t.Errorf("missing header in empty prompt: %q", got)
	}
	if strings.Contains(got, ">") {
		t.Errorf("empty prompt unexpectedly contains a quoted line: %q", got)
	}
}

func TestFormatPrompt_MultilineBody(t *testing.T) {
	got := FormatPrompt([]Comment{
		{File: "x.go", Line: 1, Side: "new", Body: "first\nsecond"},
	})
	if !strings.Contains(got, "> first\n> second\n") {
		t.Errorf("multiline body not blockquoted line-by-line: %q", got)
	}
}

func TestFormatPrompt_UnknownSidePassthrough(t *testing.T) {
	got := FormatPrompt([]Comment{
		{File: "x.go", Line: 5, Side: "weird", Body: "?"},
	})
	if !strings.Contains(got, "(weird)") {
		t.Errorf("unknown side label not preserved: %q", got)
	}
}
