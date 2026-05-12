package diff

import (
	"fmt"
	"os/exec"
)

// Run shells out to `git diff` (or `git diff --cached` when staged is true)
// and parses the result. It is intentionally thin: parsing lives in Parse so
// it can be unit-tested without invoking git.
func Run(staged bool) (*Diff, error) {
	args := []string{"diff", "--no-color", "-U3"}
	if staged {
		args = append(args, "--cached")
	}
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git %v: %w", args, err)
	}
	files, err := Parse(string(out))
	if err != nil {
		return nil, err
	}
	return &Diff{Staged: staged, Files: files}, nil
}
