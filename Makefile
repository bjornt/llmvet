.PHONY: all web build extensions test check clean

# Extension source + build script.
SHARE_DIR := share

BIN     := bin/llmvet
WEB_DIR := web
DIST_DIR := internal/assets/dist
LDFLAGS ?=

all: build

# Build the frontend bundle into the directory that internal/assets embeds.
web:
	cd $(WEB_DIR) && npm install && npm run build

# Compile the Go binary. Depends on `web` because internal/assets embeds the
# vite output via //go:embed, which fails at compile time if the dist/
# directory is empty.
build: web
	go build '-ldflags=$(LDFLAGS)' -o $(BIN) ./cmd/llmvet

# Build self-contained, auto-discoverable llmvet extension packages for pi and
# oh-my-pi from the shared source in share/. Output is one dir per runtime
# under share/dist/extensions/<runtime>/llmvet/ — copy the llmvet/ dir into the
# host's extensions/ folder (e.g. ~/.omp/agent/extensions/) for auto-discovery.
extensions:
	cd $(SHARE_DIR) && npm install && npm run build

test:
	go test ./...

check: web
	go vet ./...
	go test ./...

clean:
	rm -rf bin
	rm -rf $(DIST_DIR)
	rm -rf $(SHARE_DIR)/node_modules
	rm -rf $(SHARE_DIR)/dist
