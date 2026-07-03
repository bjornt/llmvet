package diff

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// binaryCheckBytes is how many bytes of a file we inspect for a NUL byte
// when deciding whether it is binary. This matches Git's own heuristic.
const binaryCheckBytes = 8192

// isBinary reports whether path looks like a binary file. It reads at most
// binaryCheckBytes bytes and returns true if any of them is a NUL byte.
// Errors opening the file are treated as "not binary" so that the normal
// ReadFile error handling below can decide what to do.
func isBinary(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, binaryCheckBytes)
	n, _ := io.ReadFull(f, buf)
	for _, b := range buf[:n] {
		if b == 0 {
			return true
		}
	}
	return false
}

// Run shells out to `git diff` (or `git diff --cached` when staged is true)
// and parses the result. It is intentionally thin: parsing lives in Parse so
// it can be unit-tested without invoking git.
// When staged is false, untracked files are included in the result.
func Run(staged bool) (*Diff, error) {
	args := []string{"diff", "--no-color", "-U3"}
	if staged {
		args = append(args, "--cached")
	}
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git %v: %w", args, err)
	}

	var untracked []string
	if !staged {
		untrackedOut, err := exec.Command("git", "ls-files", "--others", "--exclude-standard").Output()
		if err != nil {
			return nil, fmt.Errorf("git ls-files: %w", err)
		}
		raw := strings.TrimSpace(string(untrackedOut))
		if raw != "" {
			for _, p := range strings.Split(raw, "\n") {
				// Binary untracked files are listed in the UI but we never read
				// their contents into memory.
				if isBinary(p) {
					var sb strings.Builder
					sb.WriteString(fmt.Sprintf("diff --git a/%s b/%s\n", p, p))
					sb.WriteString("new file mode 100644\n")
					sb.WriteString(fmt.Sprintf("Binary files /dev/null and b/%s differ\n", p))
					out = append(out, sb.String()...)
					untracked = append(untracked, p)
					continue
				}
				content, err := os.ReadFile(p)
				if err != nil {
					continue
				}
				lines := strings.Split(string(content), "\n")
				if len(lines) > 0 && lines[len(lines)-1] == "" {
					lines = lines[:len(lines)-1]
				}
				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("diff --git a/%s b/%s\n", p, p))
				sb.WriteString("new file mode 100644\n")
				sb.WriteString(fmt.Sprintf("--- /dev/null\n+++ b/%s\n", p))
				if len(lines) > 0 {
					sb.WriteString(fmt.Sprintf("@@ -0,0 +1,%d @@\n", len(lines)))
					for _, l := range lines {
						sb.WriteString("+" + l + "\n")
					}
				}
				out = append(out, sb.String()...)
				untracked = append(untracked, p)
			}
		}
	}

	files, err := Parse(string(out))
	if err != nil {
		return nil, err
	}
	return &Diff{Staged: staged, Files: files, Untracked: untracked}, nil
}
