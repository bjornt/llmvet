package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"llmvet/internal/assets"
	"llmvet/internal/browser"
	"llmvet/internal/diff"
	"llmvet/internal/mcp"
	"llmvet/internal/server"
)

var Version = "0.3.0"

func main() {
	// Subcommand: llmvet mcp — run as MCP stdio server
	if len(os.Args) > 1 && os.Args[1] == "mcp" {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err := mcp.Run(ctx, Version); err != nil {
			fmt.Fprintf(os.Stderr, "llmvet mcp: %v\n", err)
			os.Exit(1)
		}
		return
	}

	port := flag.Int("port", 0, "TCP port to bind (0 = random free port)")
	host := flag.String("host", envDefault("LLMVET_HOST", "127.0.0.1"), "IP address to bind (env: LLMVET_HOST)")
	noOpen := flag.Bool("no-open", false, "do not open the browser automatically")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(Version)
		return
	}

	os.Exit(run(*host, *port, *noOpen))
}

func run(host string, port int, noOpen bool) int {
	srv := server.New(diff.Run, assets.FS())
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	if err := srv.Listen(addr); err != nil {
		fmt.Fprintf(os.Stderr, "llmvet: bind %s: %v\n", addr, err)
		return 1
	}

	url := srv.URL()
	fmt.Fprintf(os.Stderr, "Open %s to review\n", url)
	if !noOpen {
		browser.Open(url)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	result := srv.Serve(ctx)
	switch result.Action {
	case server.ActionSubmit:
		fmt.Print(server.FormatPrompt(result.Comments))
		return 0
	case server.ActionApprove:
		return 0
	default:
		fmt.Fprintln(os.Stderr, "review aborted")
		return 130
	}
}

func envDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
