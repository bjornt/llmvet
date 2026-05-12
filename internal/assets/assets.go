// Package assets exposes the embedded frontend bundle.
//
// Vite writes its build output into ./dist (configured in web/vite.config.ts).
// A placeholder dist/index.html is committed so `go build` works before the
// frontend has been built.
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
