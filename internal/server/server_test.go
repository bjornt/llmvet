package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"llmvet/internal/diff"
)

// fakeAssets is a minimal embedded-FS stand-in: an index.html so "/" works in
// the SPA route, plus a second file we can request by name.
func fakeAssets() fstest.MapFS {
	return fstest.MapFS{
		"index.html":     {Data: []byte("<!doctype html><title>spa</title>")},
		"static/app.js":  {Data: []byte("console.log('hi');")},
	}
}

func okDiff(staged bool) (*diff.Diff, error) {
	return &diff.Diff{Staged: staged, Files: []diff.File{}}, nil
}

func errDiff(staged bool) (*diff.Diff, error) {
	return nil, errors.New("git failed")
}

func newTestServer(t *testing.T, fn DiffFn) *Server {
	t.Helper()
	if fn == nil {
		fn = okDiff
	}
	return New(fn, fakeAssets())
}

func TestHandleDiff_DefaultsToUnstaged(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/diff", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("content-type = %q, want application/json", got)
	}
	var body diff.Diff
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Staged {
		t.Errorf("staged = true, want false (no query param means unstaged)")
	}
}

func TestHandleDiff_StagedTrue(t *testing.T) {
	var got bool
	srv := newTestServer(t, func(staged bool) (*diff.Diff, error) {
		got = staged
		return &diff.Diff{Staged: staged}, nil
	})

	req := httptest.NewRequest(http.MethodGet, "/api/diff?staged=true", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !got {
		t.Errorf("DiffFn called with staged=false, want true")
	}
}

func TestHandleDiff_InvalidStaged(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/diff?staged=maybe", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestHandleDiff_UnderlyingError(t *testing.T) {
	srv := newTestServer(t, errDiff)

	req := httptest.NewRequest(http.MethodGet, "/api/diff", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}

func TestHandleDiff_WrongMethod(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/diff", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHandleSubmit_RecordsCommentsAndSignals(t *testing.T) {
	srv := newTestServer(t, nil)

	body := `{"comments":[{"file":"a.go","line":3,"side":"new","body":"why?"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/submit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	select {
	case got := <-srv.resultCh:
		if got.Action != ActionSubmit {
			t.Errorf("action = %v, want submit", got.Action)
		}
		if len(got.Comments) != 1 || got.Comments[0].File != "a.go" || got.Comments[0].Line != 3 {
			t.Errorf("comments = %+v, want one entry for a.go:3", got.Comments)
		}
	case <-time.After(time.Second):
		t.Fatal("submit did not signal a result")
	}
}

func TestHandleSubmit_BadJSON(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/submit", strings.NewReader("not json"))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	select {
	case got := <-srv.resultCh:
		t.Fatalf("invalid submit signalled %+v; should be ignored", got)
	default:
	}
}

func TestHandleSubmit_WrongMethod(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/submit", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHandleApprove_POST(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/approve", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	got := <-srv.resultCh
	if got.Action != ActionApprove {
		t.Errorf("action = %v, want approve", got.Action)
	}
	if len(got.Comments) != 0 {
		t.Errorf("comments = %v, want none", got.Comments)
	}
}

func TestHandleApprove_GETReturnsHTML(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/approve", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("content-type = %q, want text/html", ct)
	}
	if !strings.Contains(rec.Body.String(), "Approved") {
		t.Errorf("body missing 'Approved' message: %q", rec.Body.String())
	}

	got := <-srv.resultCh
	if got.Action != ActionApprove {
		t.Errorf("action = %v, want approve", got.Action)
	}
}

func TestSignal_OnlyFirstWins(t *testing.T) {
	srv := newTestServer(t, nil)

	srv.signal(Result{Action: ActionApprove})
	srv.signal(Result{Action: ActionSubmit, Comments: []Comment{{File: "x"}}})

	got := <-srv.resultCh
	if got.Action != ActionApprove {
		t.Errorf("action = %v, want approve (second signal must be dropped)", got.Action)
	}
	select {
	case extra := <-srv.resultCh:
		t.Fatalf("second signal leaked through: %+v", extra)
	default:
	}
}

func TestServeSPA_RootServesIndex(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "spa") {
		t.Errorf("body missing index.html content: %q", rec.Body.String())
	}
}

func TestServeSPA_StaticAsset(t *testing.T) {
	srv := newTestServer(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/static/app.js", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "console.log") {
		t.Errorf("body = %q, want JS content", rec.Body.String())
	}
}

// TestServe_ApproveTriggersShutdown covers the full Listen/Serve lifecycle
// end-to-end: bind a real socket, fire a request, and confirm Serve returns
// the expected Result.
func TestServe_ApproveTriggersShutdown(t *testing.T) {
	srv := New(okDiff, fakeAssets())
	if err := srv.Listen("127.0.0.1:0"); err != nil {
		t.Fatalf("Listen: %v", err)
	}

	resultCh := make(chan Result, 1)
	go func() { resultCh <- srv.Serve(context.Background()) }()

	// Give the server goroutine a moment to start accepting before we hit it.
	url := srv.URL() + "api/approve"
	var resp *http.Response
	var err error
	for i := 0; i < 20; i++ {
		resp, err = http.Post(url, "application/json", nil)
		if err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("POST approve: %v", err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	select {
	case got := <-resultCh:
		if got.Action != ActionApprove {
			t.Errorf("action = %v, want approve", got.Action)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve did not return after approve")
	}
}

func TestServe_ContextCancelAborts(t *testing.T) {
	srv := New(okDiff, fakeAssets())
	if err := srv.Listen("127.0.0.1:0"); err != nil {
		t.Fatalf("Listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	resultCh := make(chan Result, 1)
	go func() { resultCh <- srv.Serve(ctx) }()

	cancel()
	select {
	case got := <-resultCh:
		if got.Action != ActionAborted {
			t.Errorf("action = %v, want aborted", got.Action)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve did not return after context cancel")
	}
}
