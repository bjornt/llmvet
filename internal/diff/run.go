package diff

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

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
