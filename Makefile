.PHONY: all web build test clean

BIN      := bin/llmreview
WEB_DIR  := web
DIST_DIR := internal/assets/dist

all: build

# Build the frontend bundle into the directory that internal/assets embeds.
web:
	cd $(WEB_DIR) && npm install && npm run build

# Compile the Go binary. Depends on `web` because internal/assets embeds the
# vite output via //go:embed, which fails at compile time if the dist/
# directory is empty.
build: web
	go build -o $(BIN) ./cmd/llmreview

test:
	go test ./...

clean:
	rm -rf bin
	rm -rf $(WEB_DIR)/node_modules
	rm -rf $(DIST_DIR)
