// Package server hosts the local HTTP API and serves the embedded SPA.
//
// Lifecycle: a single review cycle creates one Server, calls Listen to bind a
// socket, then Serve to run until either an API endpoint signals a result
// (submit/approve) or the supplied context is cancelled (SIGINT/SIGTERM). The
// returned Result tells the caller what to do on its way out — write the
// review prompt to stdout, exit silently, or report an aborted review.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"llmvet/internal/diff"
)

// Action is what triggered the server to shut down.
type Action int

const (
	// ActionAborted means the server stopped without a user decision
	// (Ctrl-C, SIGTERM, browser closed without acting).
	ActionAborted Action = iota
	// ActionSubmit means the user submitted a review with comments.
	ActionSubmit
	// ActionApprove means the user approved the diff without changes.
	ActionApprove
)

// Comment is one inline review comment, as posted to /api/submit.
type Comment struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Side string `json:"side"`
	Body string `json:"body"`
}

// Result is what Serve returns once the server has shut down.
type Result struct {
	Action   Action
	Comments []Comment
}

// DiffFn produces the diff to render. Injected so tests don't need a real
// git repo; production wiring passes diff.Run.
type DiffFn func(staged bool) (*diff.Diff, error)

// Server owns the HTTP listener and the shutdown plumbing.
type Server struct {
	diff   DiffFn
	assets fs.FS

	httpServer *http.Server
	listener   net.Listener

	resultCh chan Result
	once     sync.Once
}

// New constructs a Server but does not bind a socket yet — call Listen.
func New(diffFn DiffFn, assets fs.FS) *Server {
	s := &Server{
		diff:     diffFn,
		assets:   assets,
		resultCh: make(chan Result, 1),
	}
	s.httpServer = &http.Server{Handler: s.routes()}
	return s
}

// Listen binds a TCP socket on addr. Use ":0" or "127.0.0.1:0" for a random
// free port; query the assigned port via Addr afterwards.
func (s *Server) Listen(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	s.listener = ln
	return nil
}

// Addr returns the bound socket address, e.g. "127.0.0.1:54321". Only valid
// after Listen has succeeded.
func (s *Server) Addr() string {
	return s.listener.Addr().String()
}

// URL returns a browser-friendly URL pointing at the bound socket.
func (s *Server) URL() string {
	return "http://" + s.Addr() + "/"
}

// Serve runs the HTTP server until either ctx is cancelled or an API endpoint
// records a Result. After either, it shuts the server down gracefully and
// returns the Result. Serve must be called exactly once per Server.
func (s *Server) Serve(ctx context.Context) Result {
	serveErr := make(chan error, 1)
	go func() { serveErr <- s.httpServer.Serve(s.listener) }()

	var result Result
	select {
	case result = <-s.resultCh:
	case <-ctx.Done():
		result = Result{Action: ActionAborted}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.httpServer.Shutdown(shutdownCtx)
	<-serveErr
	return result
}

// Handler exposes the routing for tests; production code uses Serve.
func (s *Server) Handler() http.Handler {
	return s.routes()
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/diff", s.handleDiff)
	mux.HandleFunc("/api/submit", s.handleSubmit)
	mux.HandleFunc("/api/approve", s.handleApprove)
	mux.Handle("/", http.FileServer(http.FS(s.assets)))
	return mux
}

// signal records the first result produced by any handler. Subsequent calls
// are dropped — once the user has acted, the server is on its way out and any
// further requests (e.g. a stale tab) should be ignored.
func (s *Server) signal(r Result) {
	s.once.Do(func() { s.resultCh <- r })
}

func (s *Server) handleDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	staged, err := parseBool(r.URL.Query().Get("staged"))
	if err != nil {
		http.Error(w, "invalid staged parameter", http.StatusBadRequest)
		return
	}
	d, err := s.diff(staged)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(d); err != nil {
		// Response is already partially flushed; nothing useful to do.
		return
	}
}

func (s *Server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Comments []Comment `json:"comments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
	s.signal(Result{Action: ActionSubmit, Comments: body.Comments})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		w.WriteHeader(http.StatusOK)
		s.signal(Result{Action: ActionApprove})
	case http.MethodGet:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, approvedHTML)
		s.signal(Result{Action: ActionApprove})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// parseBool accepts "" (false), "true", "false", "1", "0".
func parseBool(s string) (bool, error) {
	if s == "" {
		return false, nil
	}
	return strconv.ParseBool(s)
}

const approvedHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>llmvet — approved</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100vh; margin: 0; background: #f7f7f8; color: #222; }
  .card { padding: 2rem 3rem; background: white; border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-align: center; }
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  p { margin: 0; color: #555; }
</style>
</head>
<body>
<div class="card">
  <h1>Approved</h1>
  <p>You can close this tab.</p>
</div>
</body>
</html>
`
