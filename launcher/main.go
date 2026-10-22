// Timesheet Studio launcher.
//
// Serves the embedded single-page app on 127.0.0.1, opens it in a chromeless Edge/Chrome
// "app" window, and stores the data as JSON files next to the exe (with rolling backups).
// The process exits by itself shortly after the window is closed.
package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed app/index.html
var indexHTML []byte

const (
	appID       = "timesheet-studio"
	version     = "1.0.0"
	defaultPort = 47615
	keepBackups = 60
	backupEvery = time.Hour
)

type server struct {
	dataDir   string
	exportDir string

	mu            sync.Mutex
	lastSeen      time.Time
	seenOnce      bool
	closingAt     time.Time
	browserAlive  bool
	tracked       bool // an app window process was started and can be waited on
	lastBackup    time.Time
	stateFileLock sync.Mutex
}

func main() {
	noBrowser := flag.Bool("no-browser", false, "do not open a window (serve only)")
	port := flag.Int("port", defaultPort, "preferred port")
	dataFlag := flag.String("data", "", "data folder (default: next to the exe)")
	flag.Parse()

	dataDir, exportDir, err := resolveDirs(*dataFlag)
	if err != nil {
		fatal("Cannot create the data folder:\n" + err.Error())
	}
	logFile, _ := os.OpenFile(filepath.Join(dataDir, "launcher.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if logFile != nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}
	log.Printf("start %s, data=%s exports=%s", version, dataDir, exportDir)

	// One instance per data folder: if our app already runs on the port, just open another window.
	if url := runningInstance(*port, dataDir); url != "" {
		log.Printf("already running at %s", url)
		if !*noBrowser {
			openWindow(url, dataDir)
		}
		return
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatal("Cannot start the local server:\n" + err.Error())
		}
	}
	addr := ln.Addr().(*net.TCPAddr)
	url := fmt.Sprintf("http://127.0.0.1:%d/", addr.Port)

	s := &server{dataDir: dataDir, exportDir: exportDir, lastSeen: time.Now()}
	s.initBackupTime()
	s.backupIfDue(true)

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/ping", s.handlePing)
	mux.HandleFunc("/api/heartbeat", s.handleHeartbeat)
	mux.HandleFunc("/api/closing", s.handleClosing)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/backup-now", s.handleBackupNow)
	mux.HandleFunc("/api/backups", s.handleBackups)
	mux.HandleFunc("/api/backups/", s.handleBackupFile)
	mux.HandleFunc("/api/export", s.handleExport)
	mux.HandleFunc("/api/open", s.handleOpen)

	srv := &http.Server{Handler: s.guard(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("serve: %v", err)
		}
	}()
	log.Printf("listening on %s", url)

	if *noBrowser {
		fmt.Println("Timesheet Studio running at", url)
		select {}
	}

	go func() {
		cmd := openWindow(url, dataDir)
		if cmd != nil {
			s.setBrowserAlive(true)
			_ = cmd.Wait()
			s.setBrowserAlive(false)
			log.Printf("browser window process ended")
		}
	}()
	s.watchdog()
	log.Printf("exit")
}

/* ---------------------------------------------------------------- folders */

func resolveDirs(flagDir string) (string, string, error) {
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)
	besideExe := filepath.Join(exeDir, "TimesheetStudio-data")
	candidates := []string{besideExe}
	if flagDir != "" {
		candidates = []string{flagDir}
	} else if cfg, err := os.UserConfigDir(); err == nil {
		// e.g. when the exe sits in a read-only folder
		candidates = append(candidates, filepath.Join(cfg, "TimesheetStudio"))
	}
	var lastErr error
	for _, dir := range candidates {
		if err := ensureWritable(dir); err != nil {
			lastErr = err
			continue
		}
		_ = os.MkdirAll(filepath.Join(dir, "backups"), 0o755)
		exports := []string{filepath.Join(dir, "Timesheets")}
		if dir == besideExe {
			exports = append([]string{filepath.Join(exeDir, "Timesheets")}, exports...)
		} else if home, err := os.UserHomeDir(); err == nil && flagDir == "" {
			exports = append([]string{filepath.Join(home, "Documents", "Timesheets")}, exports...)
		}
		for _, e := range exports {
			if ensureWritable(e) == nil {
				return dir, e, nil
			}
		}
		return dir, dir, nil
	}
	return "", "", lastErr
}

func ensureWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	probe := filepath.Join(dir, ".write-test")
	if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
		return err
	}
	return os.Remove(probe)
}

/* ---------------------------------------------------------------- instance + window */

func runningInstance(port int, dataDir string) string {
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	client := http.Client{Timeout: 700 * time.Millisecond}
	resp, err := client.Get(url + "api/ping")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var info map[string]any
	if json.NewDecoder(resp.Body).Decode(&info) != nil || info["app"] != appID {
		return ""
	}
	if d, _ := info["dataDir"].(string); d != "" && !sameDir(d, dataDir) {
		return ""
	}
	return url
}

func sameDir(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

func browserCandidates() []string {
	switch runtime.GOOS {
	case "windows":
		var out []string
		for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
			base := os.Getenv(env)
			if base == "" {
				continue
			}
			out = append(out,
				filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
		return out
	case "darwin":
		return []string{"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
	default:
		return []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"}
	}
}

// openWindow starts an app-mode browser window. Returns the process when it can be tracked.
func openWindow(url, dataDir string) *exec.Cmd {
	profile := filepath.Join(dataDir, "browser-profile")
	args := []string{
		"--app=" + url,
		"--user-data-dir=" + profile,
		"--window-size=1480,940",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate",
		"--disable-background-mode",
	}
	for _, b := range browserCandidates() {
		path := b
		if !filepath.IsAbs(b) {
			p, err := exec.LookPath(b)
			if err != nil {
				continue
			}
			path = p
		} else if _, err := os.Stat(b); err != nil {
			continue
		}
		cmd := exec.Command(path, args...)
		if err := cmd.Start(); err == nil {
			log.Printf("opened window with %s", path)
			return cmd
		}
	}
	// Fallback: default browser (process cannot be tracked; heartbeats keep us alive).
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("cannot open browser: %v", err)
	}
	return nil
}

/* ---------------------------------------------------------------- lifetime */

func (s *server) setBrowserAlive(v bool) {
	s.mu.Lock()
	if v {
		s.tracked = true
	}
	s.browserAlive = v
	s.mu.Unlock()
}

func (s *server) touch() {
	s.mu.Lock()
	s.lastSeen = time.Now()
	s.seenOnce = true
	s.closingAt = time.Time{}
	s.mu.Unlock()
}

// watchdog returns when the app window has been closed.
// The page sends a heartbeat every 5 s and a "closing" beacon when it unloads (a reload sends
// one too, but heartbeats resume immediately). Minimised windows may be throttled to one timer
// per minute, so silence alone only ends the app after a generous delay.
func (s *server) watchdog() {
	start := time.Now()
	for {
		time.Sleep(2 * time.Second)
		s.mu.Lock()
		idle := time.Since(s.lastSeen)
		seen := s.seenOnce
		alive := s.browserAlive
		tracked := s.tracked
		closing := !s.closingAt.IsZero() && time.Since(s.closingAt) > 6*time.Second
		s.mu.Unlock()
		switch {
		case !seen && time.Since(start) > 5*time.Minute:
			return // the window never connected
		case seen && closing && idle > 12*time.Second:
			log.Printf("window closed")
			return
		case seen && tracked && !alive && idle > 20*time.Second:
			log.Printf("app window process ended")
			return
		case seen && !alive && idle > 150*time.Second:
			return // untracked browser tab gone
		case seen && idle > 15*time.Minute:
			return
		}
	}
}

/* ---------------------------------------------------------------- http */

// guard only accepts requests addressed to the local server (blocks DNS-rebinding and other sites).
func (s *server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "127.0.0.1" && host != "localhost" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && !strings.HasPrefix(origin, "http://127.0.0.1:") && !strings.HasPrefix(origin, "http://localhost:") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			s.touch()
		}
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(indexHTML)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func (s *server) handlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"app": appID, "version": version, "dataDir": s.dataDir, "exportDir": s.exportDir, "os": runtime.GOOS})
}

func (s *server) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleClosing(w http.ResponseWriter, r *http.Request) {
	log.Printf("page unloading")
	s.mu.Lock()
	s.closingAt = time.Now()
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) statePath() string { return filepath.Join(s.dataDir, "state.json") }

func (s *server) handleState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(s.statePath())
		if errors.Is(err, os.ErrNotExist) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
	case http.MethodPut, http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 200<<20))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !json.Valid(body) {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		s.backupIfDue(false)
		if err := s.writeState(body); err != nil {
			log.Printf("save: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) writeState(body []byte) error {
	s.stateFileLock.Lock()
	defer s.stateFileLock.Unlock()
	tmp := s.statePath() + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.statePath()) // replaces the old file atomically (also on Windows)
}

/* ---------------------------------------------------------------- backups */

var backupName = regexp.MustCompile(`^state-\d{8}-\d{6}(-[a-z]+)?\.json$`)

func (s *server) backupDir() string { return filepath.Join(s.dataDir, "backups") }

func (s *server) initBackupTime() {
	list := s.listBackups()
	if len(list) > 0 {
		s.lastBackup = list[0].mod
	}
}

func (s *server) backupIfDue(force bool) {
	s.mu.Lock()
	due := force || time.Since(s.lastBackup) >= backupEvery
	s.mu.Unlock()
	if !due {
		return
	}
	s.makeBackup("")
}

func (s *server) makeBackup(tag string) string {
	s.stateFileLock.Lock()
	defer s.stateFileLock.Unlock()
	b, err := os.ReadFile(s.statePath())
	if err != nil || len(b) == 0 {
		return ""
	}
	name := "state-" + time.Now().Format("20060102-150405")
	if tag != "" {
		name += "-" + tag
	}
	name += ".json"
	if err := os.WriteFile(filepath.Join(s.backupDir(), name), b, 0o644); err != nil {
		log.Printf("backup: %v", err)
		return ""
	}
	s.mu.Lock()
	s.lastBackup = time.Now()
	s.mu.Unlock()
	list := s.listBackups()
	for i := keepBackups; i < len(list); i++ {
		_ = os.Remove(filepath.Join(s.backupDir(), list[i].name))
	}
	return name
}

type backupInfo struct {
	name string
	mod  time.Time
	size int64
}

func (s *server) listBackups() []backupInfo {
	entries, _ := os.ReadDir(s.backupDir())
	var out []backupInfo
	for _, e := range entries {
		if e.IsDir() || !backupName.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, backupInfo{e.Name(), info.ModTime(), info.Size()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name > out[j].name })
	return out
}

func (s *server) handleBackupNow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, map[string]any{"name": s.makeBackup("manual")})
}

func (s *server) handleBackups(w http.ResponseWriter, r *http.Request) {
	list := s.listBackups()
	out := make([]map[string]any, 0, len(list))
	for _, b := range list {
		out = append(out, map[string]any{"name": b.name, "time": b.mod.Format(time.RFC3339), "size": b.size})
	}
	writeJSON(w, out)
}

func (s *server) handleBackupFile(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/backups/")
	if !backupName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	b, err := os.ReadFile(filepath.Join(s.backupDir(), name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(b)
}

/* ---------------------------------------------------------------- export + open */

var unsafeName = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]+`)

func (s *server) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := filepath.Base(unsafeName.ReplaceAllString(r.URL.Query().Get("name"), "_"))
	if name == "" || name == "." || name == ".." {
		name = "timesheet.xlsx"
	}
	if !strings.HasSuffix(strings.ToLower(name), ".xlsx") {
		name += ".xlsx"
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 100<<20))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(s.exportDir, 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	path := filepath.Join(s.exportDir, name)
	// If the file is open in Excel it is locked: save under a new name instead of failing.
	for i := 2; i < 50; i++ {
		err = os.WriteFile(path, body, 0o644)
		if err == nil {
			break
		}
		path = filepath.Join(s.exportDir, fmt.Sprintf("%s (%d).xlsx", base, i))
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	log.Printf("exported %s", path)
	writeJSON(w, map[string]any{"path": path})
}

func (s *server) handleOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target := r.URL.Query().Get("target")
	var err error
	switch target {
	case "exports":
		err = openPath(s.exportDir)
	case "data":
		err = openPath(s.dataDir)
	case "file":
		p := filepath.Clean(r.URL.Query().Get("path"))
		rel, rerr := filepath.Rel(s.exportDir, p)
		if rerr != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		err = openPath(p)
	default:
		http.Error(w, "unknown target", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func openPath(p string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", p)
	case "darwin":
		cmd = exec.Command("open", p)
	default:
		cmd = exec.Command("xdg-open", p)
	}
	return cmd.Start()
}
