package diff

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

func TestIsBinary(t *testing.T) {
	tmp := t.TempDir()

	textPath := filepath.Join(tmp, "text.txt")
	if err := os.WriteFile(textPath, []byte("hello, world\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if isBinary(textPath) {
		t.Errorf("text.txt reported as binary")
	}

	binPath := filepath.Join(tmp, "binary.bin")
	if err := os.WriteFile(binPath, []byte{0x00, 0x01, 0x02, 0x03}, 0o644); err != nil {
		t.Fatal(err)
	}
	if !isBinary(binPath) {
		t.Errorf("binary.bin not reported as binary")
	}
}

func TestRunIncludesBinaryUntrackedAsPlaceholder(t *testing.T) {
	tmp := t.TempDir()

	for _, args := range [][]string{
		{"init", "-q"},
		{"config", "user.email", "test@example.com"},
		{"config", "user.name", "Test"},
	} {
		cmd := exec.Command("git", args...)
		cmd.Dir = tmp
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	if err := os.WriteFile(filepath.Join(tmp, "tracked.txt"), []byte("tracked\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "tracked.txt")
	cmd.Dir = tmp
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add: %v\n%s", err, out)
	}
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = tmp
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit: %v\n%s", err, out)
	}

	if err := os.WriteFile(filepath.Join(tmp, "text.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "binary.bin"), []byte{0x00, 0x01, 0x02, 0x03}, 0o644); err != nil {
		t.Fatal(err)
	}

	origWd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(origWd)

	d, err := Run(false)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(d.Files) != 2 {
		t.Fatalf("got %d files, want 2", len(d.Files))
	}

	byPath := make(map[string]File)
	for _, f := range d.Files {
		byPath[f.Path] = f
	}

	text, ok := byPath["text.txt"]
	if !ok {
		t.Fatalf("text.txt missing from files")
	}
	if text.Status != StatusAdded || text.Binary || len(text.Hunks) != 1 {
		t.Errorf("text.txt = %+v; want added text file with one hunk", text)
	}

	bin, ok := byPath["binary.bin"]
	if !ok {
		t.Fatalf("binary.bin missing from files")
	}
	if bin.Status != StatusAdded || !bin.Binary || len(bin.Hunks) != 0 {
		t.Errorf("binary.bin = %+v; want added binary file with no hunks", bin)
	}

	wantUntracked := map[string]bool{"text.txt": true, "binary.bin": true}
	gotUntracked := make(map[string]bool)
	for _, p := range d.Untracked {
		gotUntracked[p] = true
	}
	if !reflect.DeepEqual(gotUntracked, wantUntracked) {
		t.Errorf("untracked = %v, want %v", gotUntracked, wantUntracked)
	}
}
