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
	"llmvet/internal/diff"
	"llmvet/internal/server"
)

var Version = "0.1.0"

func main() {
	port := flag.Int("port", 0, "TCP port to bind on 127.0.0.1 (0 = random free port)")
	noOpen := flag.Bool("no-open", false, "do not open the browser automatically")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(Version)
		return
	}

	os.Exit(run(*port, *noOpen))
}

func run(port int, noOpen bool) int {
	srv := server.New(diff.Run, assets.FS())
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	if err := srv.Listen(addr); err != nil {
		fmt.Fprintf(os.Stderr, "llmvet: bind %s: %v\n", addr, err)
		return 1
	}

	url := srv.URL()
	fmt.Fprintf(os.Stderr, "Open %s to review\n", url)
	if !noOpen {
		openBrowser(url)
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
