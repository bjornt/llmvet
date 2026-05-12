package main

import (
	"os/exec"
	"runtime"
)

// openBrowser launches the platform-specific URL handler. Failures are
// silently ignored: the URL is also printed to stderr so the user can open
// it themselves.
func openBrowser(url string) {
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
