import { execSync } from 'node:child_process';

export const UNKNOWN_TERMINAL_WIDTH = 40;
// PowerShell / Windows Terminal default; used when nothing else can be detected
// on Windows. Better to assume a wide terminal and let real content fit on one
// line than to default to 40 cols which forces every multi-section line to stack.
const WINDOWS_FALLBACK_WIDTH = 120;

// Claude Code spawns the statusline with stdin+stdout piped and no COLUMNS env
// var, so process.stdout.columns / process.stderr.columns / env.COLUMNS are all
// undefined. /dev/tty is still reachable via the controlling terminal of the
// parent process, so `stty -F /dev/tty size` returns the real width.
function readTtyColumns(): number | null {
  try {
    const out = execSync('stty -F /dev/tty size 2>/dev/null', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 100,
    }).toString().trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 2) {
      const cols = Number.parseInt(parts[1], 10);
      if (Number.isFinite(cols) && cols > 0) return cols;
    }
  } catch { /* no tty or stty unavailable */ }
  return null;
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

  return readTtyColumns();
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
