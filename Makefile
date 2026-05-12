.PHONY: all web build test clean

BIN      := bin/llmreview
WEB_DIR  := web
DIST_DIR := internal/assets/dist

all: build

# Build the frontend bundle into the directory that internal/assets embeds.
web:
	cd $(WEB_DIR) && npm install && npm run build

# Compile the Go binary. Run `make web` first for a populated bundle; otherwise
# the committed placeholder index.html ships in the binary.
build:
	go build -o $(BIN) ./cmd/llmreview

test:
	go test ./...

clean:
	rm -rf bin
	rm -rf $(WEB_DIR)/node_modules
	# Wipe build artifacts; preserve the committed placeholder so `go build`
	# keeps working on a fresh checkout.
	find $(DIST_DIR) -mindepth 1 -not -name index.html -delete 2>/dev/null || true
