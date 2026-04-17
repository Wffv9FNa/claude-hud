import { execSync } from 'node:child_process';

export const UNKNOWN_TERMINAL_WIDTH = 40;

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
