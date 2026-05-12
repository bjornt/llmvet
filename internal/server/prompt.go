package server

import (
	"fmt"
	"strings"
)

// FormatPrompt renders the reviewer's comments as the plain-text prompt the
// calling agent reads from stdout. The format is the SPEC example: a single
// header line, then one blank-line-separated block per comment with the file,
// line, side annotation, and a blockquoted body.
func FormatPrompt(comments []Comment) string {
	var b strings.Builder
	b.WriteString("The reviewer left the following comments on your changes. Address each one, then re-run the review.\n")
	for _, c := range comments {
		b.WriteString("\n")
		fmt.Fprintf(&b, "%s:%d (%s)\n", c.File, c.Line, sideLabel(c.Side))
		for _, line := range strings.Split(c.Body, "\n") {
			fmt.Fprintf(&b, "> %s\n", line)
		}
	}
	return b.String()
}

func sideLabel(side string) string {
	switch side {
	case "old":
		return "removed line"
	case "new":
		return "added line"
	default:
		return side
	}
}
