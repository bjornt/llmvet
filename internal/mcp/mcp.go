// Package mcp implements a minimal MCP (Model Context Protocol) stdio server
// that exposes the llmvet code-review tools.
//
// Two tools are exposed:
//
//   - start_review: binds the review HTTP server, opens the browser, returns
//     the URL immediately.
//   - wait_for_review: blocks until the human reviewer submits, approves, or
//     aborts, then returns the result.
//
// The split exists because Claude Code currently does not surface MCP
// progress notifications (see anthropics/claude-code#51713), so the only way
// to get the review URL in front of the user is to return it as the result
// of a regular, non-blocking tool call. wait_for_review also emits a
// `notifications/progress` message carrying the URL when the client supplied
// a progressToken, so harnesses that do surface progress will display it
// during the wait.
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"sync"

	"llmvet/internal/assets"
	"llmvet/internal/browser"
	"llmvet/internal/diff"
	"llmvet/internal/server"
)

// Run starts the MCP stdio server and blocks until stdin is closed or ctx is
// cancelled. It returns nil on clean shutdown.
func Run(ctx context.Context, version string) error {
	s := &mcpServer{version: version}
	return s.run(ctx)
}

type mcpServer struct {
	version string
	mu      sync.Mutex
	enc     *json.Encoder

	pending *pendingReview
}

// pendingReview tracks an in-flight review server started by start_review and
// awaited by wait_for_review.
type pendingReview struct {
	url    string
	result <-chan server.Result
	cancel context.CancelFunc
}

// JSON-RPC 2.0 types
type jsonrpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonrpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *jsonrpcError   `json:"error,omitempty"`
}

type jsonrpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// MCP protocol types

type initializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	Capabilities    capabilities `json:"capabilities"`
	ServerInfo      serverInfo   `json:"serverInfo"`
}

type capabilities struct {
	Tools *toolsCap `json:"tools,omitempty"`
}

type toolsCap struct{}

type serverInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type toolsListResult struct {
	Tools []toolDef `json:"tools"`
}

type toolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type toolCallParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
	Meta      *callMeta      `json:"_meta,omitempty"`
}

type callMeta struct {
	ProgressToken json.RawMessage `json:"progressToken,omitempty"`
}

type progressParams struct {
	ProgressToken json.RawMessage `json:"progressToken"`
	Progress      float64         `json:"progress"`
	Message       string          `json:"message,omitempty"`
}

type jsonrpcNotification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type toolCallResult struct {
	Content []contentBlock `json:"content"`
	IsError bool           `json:"isError,omitempty"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (s *mcpServer) run(ctx context.Context) error {
	s.enc = json.NewEncoder(os.Stdout)

	scanner := bufio.NewScanner(os.Stdin)
	// MCP messages can be large (diffs, etc.), allow up to 10MB lines.
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req jsonrpcRequest
		if err := json.Unmarshal(line, &req); err != nil {
			s.sendError(nil, -32700, "parse error")
			continue
		}

		if err := s.handle(ctx, &req); err != nil {
			return err
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		return err
	}
	return nil
}

func (s *mcpServer) handle(ctx context.Context, req *jsonrpcRequest) error {
	switch req.Method {
	case "initialize":
		s.sendResult(req.ID, initializeResult{
			ProtocolVersion: "2025-06-18",
			Capabilities:    capabilities{Tools: &toolsCap{}},
			ServerInfo:      serverInfo{Name: "llmvet", Version: s.version},
		})

	case "notifications/initialized":
		// Client acknowledgement — nothing to do.

	case "tools/list":
		s.sendResult(req.ID, toolsListResult{Tools: toolDefs()})

	case "tools/call":
		var params toolCallParams
		if req.Params != nil {
			if err := json.Unmarshal(req.Params, &params); err != nil {
				s.sendError(req.ID, -32602, "invalid params")
				return nil
			}
		}
		var progressToken json.RawMessage
		if params.Meta != nil {
			progressToken = params.Meta.ProgressToken
		}
		var result toolCallResult
		switch params.Name {
		case "start_review":
			result = s.startReview(ctx)
		case "wait_for_review":
			result = s.waitForReview(ctx, progressToken)
		default:
			s.sendError(req.ID, -32602, fmt.Sprintf("unknown tool: %s", params.Name))
			return nil
		}
		s.sendResult(req.ID, result)

	case "ping":
		s.sendResult(req.ID, map[string]any{})

	default:
		if req.ID != nil {
			s.sendError(req.ID, -32601, fmt.Sprintf("method not found: %s", req.Method))
		}
		// Notifications with unknown methods are silently ignored per spec.
	}
	return nil
}

func toolDefs() []toolDef {
	emptySchema := map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
	return []toolDef{
		{
			Name: "start_review",
			Description: "Start a local web-based code review with llmvet. " +
				"Binds an HTTP server on 127.0.0.1, opens the user's browser at the review URL, and returns immediately. " +
				"After calling this tool you MUST display the returned review URL to the user as plain text in your response, " +
				"so they can open it manually if their browser did not launch automatically. " +
				"Then you MUST call `wait_for_review` next, unless the user has told you to do otherwise — " +
				"that is the tool that blocks until the human reviewer leaves comments or approves the diff. " +
				"Use this when the user asks to review changes, run a code review, or requests human-in-the-loop review.",
			InputSchema: emptySchema,
		},
		{
			Name: "wait_for_review",
			Description: "Block until the human reviewer leaves comments or approves the diff in the llmvet UI started by `start_review`. " +
				"Returns either the reviewer's comments (which you should address one by one), an approval message, or an abort. " +
				"Call this immediately after `start_review`.",
			InputSchema: emptySchema,
		},
	}
}

// startReview binds a review server, opens the browser, and returns the URL
// immediately. The Serve goroutine runs in the background; wait_for_review
// consumes its result.
func (s *mcpServer) startReview(parentCtx context.Context) toolCallResult {
	// Supersede any prior pending review so we don't leak a stale server.
	s.mu.Lock()
	if s.pending != nil {
		s.pending.cancel()
		s.pending = nil
	}
	s.mu.Unlock()

	srv := server.New(diff.Run, assets.FS())
	addr := net.JoinHostPort("127.0.0.1", "0")
	if err := srv.Listen(addr); err != nil {
		return toolCallResult{
			Content: []contentBlock{{Type: "text", Text: fmt.Sprintf("Failed to bind: %v", err)}},
			IsError: true,
		}
	}

	url := srv.URL()
	fmt.Fprintf(os.Stderr, "Open %s to review\n", url)
	browser.Open(url)

	serveCtx, cancel := context.WithCancel(parentCtx)
	resultCh := make(chan server.Result, 1)
	go func() {
		resultCh <- srv.Serve(serveCtx)
	}()

	s.mu.Lock()
	s.pending = &pendingReview{
		url:    url,
		result: resultCh,
		cancel: cancel,
	}
	s.mu.Unlock()

	text := fmt.Sprintf(
		"Code review server started at %s. The browser has been opened to that URL. "+
			"Now call `wait_for_review` to wait for the reviewer to leave comments or approve the diff "+
			"(unless the user has asked you to do otherwise).",
		url,
	)
	return toolCallResult{
		Content: []contentBlock{{Type: "text", Text: text}},
	}
}

// waitForReview blocks on the most recently started review and returns the
// formatted result. If progressToken is non-empty, a notifications/progress
// message carrying the review URL is emitted before blocking, so harnesses
// that surface progress notifications can show it during the wait.
func (s *mcpServer) waitForReview(ctx context.Context, progressToken json.RawMessage) toolCallResult {
	s.mu.Lock()
	p := s.pending
	s.mu.Unlock()

	if p == nil {
		return toolCallResult{
			Content: []contentBlock{{Type: "text", Text: "No code review in progress. Call `start_review` first."}},
			IsError: true,
		}
	}

	if len(progressToken) > 0 {
		s.sendNotification("notifications/progress", progressParams{
			ProgressToken: progressToken,
			Progress:      0,
			Message:       fmt.Sprintf("Review server at %s", p.url),
		})
	}

	var result server.Result
	select {
	case result = <-p.result:
	case <-ctx.Done():
		p.cancel()
		result = <-p.result
	}

	s.mu.Lock()
	if s.pending == p {
		s.pending = nil
	}
	s.mu.Unlock()

	switch result.Action {
	case server.ActionSubmit:
		return toolCallResult{
			Content: []contentBlock{{Type: "text", Text: server.FormatPrompt(result.Comments)}},
		}
	case server.ActionApprove:
		return toolCallResult{
			Content: []contentBlock{{Type: "text", Text: "The code review was approved with no comments. No changes needed."}},
		}
	default:
		return toolCallResult{
			Content: []contentBlock{{Type: "text", Text: "The code review was aborted by the reviewer."}},
		}
	}
}

func (s *mcpServer) sendResult(id json.RawMessage, result any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.enc.Encode(jsonrpcResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	})
}

func (s *mcpServer) sendNotification(method string, params any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.enc.Encode(jsonrpcNotification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	})
}

func (s *mcpServer) sendError(id json.RawMessage, code int, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.enc.Encode(jsonrpcResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &jsonrpcError{Code: code, Message: message},
	})
}
