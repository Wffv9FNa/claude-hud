import { execSync } from 'node:child_process';
import { readlinkSync, readFileSync } from 'node:fs';

export const UNKNOWN_TERMINAL_WIDTH = 40;
// PowerShell / Windows Terminal default; used when nothing else can be detected
// on Windows. Better to assume a wide terminal and let real content fit on one
// line than to default to 40 cols which forces every multi-section line to stack.
const WINDOWS_FALLBACK_WIDTH = 120;
// Same rationale on POSIX: Claude Code on WSL (and any host that spawns the
// statusline without a controlling /dev/tty) leaves us with no way to detect
// the real width. Assume a wide terminal so combined lines fit.
const POSIX_FALLBACK_WIDTH = 120;

function ttySize(path: string): number | null {
  try {
    const out = execSync(`stty -F ${path} size 2>/dev/null`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 100,
    }).toString().trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 2) {
      const cols = Number.parseInt(parts[1], 10);
      if (Number.isFinite(cols) && cols > 0) return cols;
    }
  } catch { /* unreadable or stty unavailable */ }
  return null;
}

// Claude Code spawns the statusline with stdin+stdout piped and no COLUMNS env
// var, so process.stdout.columns / process.stderr.columns / env.COLUMNS are all
// undefined. On many setups /dev/tty is still reachable via the controlling
// terminal of the parent process, so `stty -F /dev/tty size` returns the real
// width. On WSL under Claude Code, /dev/tty is not reachable from the spawned
// process — fall back to walking /proc for an ancestor's pty.
function readTtyColumns(): number | null {
  const fromTty = ttySize('/dev/tty');
  if (fromTty !== null) return fromTty;
  return readAncestorPtyColumns();
}

// Walk up the parent-process chain via /proc/<pid>/status and inspect each
// ancestor's stdio fds. The first one that points at a real pty (/dev/pts/N
// or /dev/tty*) is queried with `stty -F` to get the real width. Caps the
// walk so a pathological cycle can't hang the statusline.
function readAncestorPtyColumns(): number | null {
  let pid = process.ppid;
  for (let i = 0; i < 12 && pid && pid > 1; i += 1) {
    for (const fd of ['0', '1', '2']) {
      try {
        const target = readlinkSync(`/proc/${pid}/fd/${fd}`);
        if (/^\/dev\/(pts\/\d+|tty\w*)$/.test(target)) {
          const cols = ttySize(target);
          if (cols !== null) return cols;
        }
      } catch { /* fd missing or not permitted */ }
    }
    pid = readParentPid(pid);
  }
  return null;
}

function readParentPid(pid: number): number {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/^PPid:\s*(\d+)/m);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch { /* /proc unavailable */ }
  return 0;
}

// Windows equivalent: `mode con` prints the console buffer info for the
// inherited console handle, e.g. "    Columns:        120". Works under
// PowerShell and cmd.exe even when stdio is piped, because the spawned node
// process still shares the parent's console.
function readWindowsConsoleColumns(): number | null {
  try {
    const out = execSync('mode con', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 200,
      windowsHide: true,
    }).toString();
    const match = out.match(/Columns:\s*(\d+)/i);
    if (match) {
      const cols = Number.parseInt(match[1], 10);
      if (Number.isFinite(cols) && cols > 0) return cols;
    }
  } catch { /* mode unavailable or no console */ }
  return null;
}

export function detectTerminalColumns(): number | null {
  const stdoutCols = process.stdout?.columns;
  if (typeof stdoutCols === 'number' && Number.isFinite(stdoutCols) && stdoutCols > 0) {
    return Math.floor(stdoutCols);
  }
  const stderrCols = process.stderr?.columns;
  if (typeof stderrCols === 'number' && Number.isFinite(stderrCols) && stderrCols > 0) {
    return Math.floor(stderrCols);
  }
  const envCols = Number.parseInt(process.env.COLUMNS ?? '', 10);
  if (Number.isFinite(envCols) && envCols > 0) return envCols;

  if (process.platform === 'win32') {
    const winCols = readWindowsConsoleColumns();
    if (winCols !== null) return winCols;
    // Last-resort default for Windows so multi-section lines combine instead
    // of stacking when running under Claude Code on PowerShell with piped
    // stdio and no detectable console.
    return WINDOWS_FALLBACK_WIDTH;
  }

  const ttyCols = readTtyColumns();
  if (ttyCols !== null) return ttyCols;
  // POSIX last-resort fallback. WSL hits this path because Claude Code spawns
  // the statusline without a reachable /dev/tty; without a wide fallback the
  // caller defaults to 40 cols and stacks every multi-section line.
  return POSIX_FALLBACK_WIDTH;
}

// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
export function getAdaptiveBarWidth(): number {
  const cols = detectTerminalColumns();
  if (cols !== null) {
    if (cols >= 100) return 10;
    if (cols >= 60) return 6;
    return 4;
  }
  return 10;
}
