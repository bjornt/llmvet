// Package browser launches the platform-specific URL handler.
package browser

import (
	"os/exec"
	"runtime"
)

// Open launches the platform-specific URL handler. Failures are silently
// ignored: callers should also surface the URL so the user can open it
// themselves if needed.
func Open(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "windows":
		cmd = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", url}
	default:
		cmd = "xdg-open"
		args = []string{url}
	}
	_ = exec.Command(cmd, args...).Start()
}
