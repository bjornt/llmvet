// Package assets exposes the embedded frontend bundle.
//
// Vite writes its build output into ./dist (configured in web/vite.config.ts).
// The dist/ directory is not checked in, so `make web` (or any equivalent
// vite build) must run before `go build` — otherwise //go:embed will fail
// because its pattern matches no files.
package assets

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// FS returns a filesystem rooted at the build output directory, ready to be
// passed to http.FileServer.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
