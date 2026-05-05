/**
 * Multi-line agent renderer.
 *
 * Direct port of `omc-reference/src/hud/elements/agents.ts#renderAgentsMultiLine`
 * with the agent-code lookup intentionally stripped down to a small abbreviation
 * map; unknown agent types fall back to their first character (case set by model
 * tier).
 */

import type { AgentEntry } from '../types.js';
import { RESET, dim, getModelTierColor, getDurationColor } from './colors.js';
import { truncateToWidth } from '../utils/string-width.js';

export interface MultiLineAgentsResult {
  headerPart: string;
  detailLines: string[];
}

export interface StalenessRenderOptions {
  staleIds: Set<string>;
  marker: string;
  suffix: string;
}

const CYAN = '\x1b[36m';
const DEFAULT_MAX_DESC_WIDTH = 45;

// Width budget for the description column when a terminal width is known.
// See .local/plans/claude-hud-layout-patch.md section 2.7 for rationale.
const WIDTH_FLOOR = 60;
const FIXED_OVERHEAD = 24;
const MIN_DESC_WIDTH = 20;

const ABBREVS: Record<string, string> = {
  'general-purpose': 'general',
  'statusline-setup': 'setup',
  'output-style-setup': 'output',
};

export function getShortAgentName(type: string): string {
  const parts = type.split(':');
  const name = parts[parts.length - 1] || type;
  return ABBREVS[name] ?? name;
}

export function getAgentCode(type: string, model?: string): string {
  const shortName = getShortAgentName(type);
  const ch = shortName.charAt(0);
  if (model && model.toLowerCase().includes('opus')) {
    return ch.toUpperCase();
  }
  return ch.toLowerCase();
}

export function formatDurationPadded(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (seconds < 10) {
    return '    ';
  } else if (seconds < 60) {
    return `${seconds}s`.padStart(4);
  } else if (minutes < 10) {
    return `${minutes}m`.padStart(4);
  } else {
    return `${minutes}m`.padStart(4);
  }
}

function sortByFreshest(agents: AgentEntry[]): AgentEntry[] {
  return [...agents].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

export function renderAgentsMultiLine(
  agents: AgentEntry[],
  maxLines = 5,
  terminalWidth: number | null = null,
  staleness?: StalenessRenderOptions
): MultiLineAgentsResult {
  const filtered = agents.filter((a) => a.status === 'running');
  if (filtered.length === 0) {
    return { headerPart: '', detailLines: [] };
  }

  const staleIds = staleness?.staleIds ?? new Set<string>();
  const marker = staleness?.marker ?? '?';
  const suffix = staleness?.suffix ?? ' (stale?)';

  // Sort: freshest first, but always non-stale before stale so real running
  // agents are never pushed off the visible window by stuck stale ones.
  const sortedByFresh = sortByFreshest(filtered);
  const running = staleIds.size > 0
    ? [
        ...sortedByFresh.filter((a) => !staleIds.has(a.id)),
        ...sortedByFresh.filter((a) => staleIds.has(a.id)),
      ]
    : sortedByFresh;
  const headerPart = `agents:${CYAN}${running.length}${RESET}`;
  const displayCount = Math.min(running.length, maxLines);
  const now = Date.now();
  const detailLines: string[] = [];

  const maxDescWidth = (terminalWidth != null && terminalWidth >= WIDTH_FLOOR)
    ? Math.max(MIN_DESC_WIDTH, terminalWidth - FIXED_OVERHEAD)
    : DEFAULT_MAX_DESC_WIDTH;

  running.slice(0, maxLines).forEach((agent, index) => {
    const isLast = index === displayCount - 1 && running.length <= maxLines;
    const prefix = isLast ? '└─' : '├─';
    const isStale = staleIds.has(agent.id);
    const code = isStale ? marker : getAgentCode(agent.type, agent.model);
    const codeColor = isStale ? '\x1b[2m' : getModelTierColor(agent.model);
    const shortName = getShortAgentName(agent.type).padEnd(12);
    const durationMs = now - agent.startTime.getTime();
    const duration = isStale ? '   ?' : formatDurationPadded(durationMs);
    const durationColor = isStale ? '\x1b[2m' : getDurationColor(durationMs);
    const desc = agent.description || '...';
    const truncatedDesc = truncateToWidth(desc, maxDescWidth);

    const row = `${dim(prefix)} ${codeColor}${code}${RESET} ${dim(shortName)}${durationColor}${duration}${RESET}  ${truncatedDesc}`;
    detailLines.push(isStale ? dim(`${row}${suffix}`) : row);
  });

  if (running.length > maxLines) {
    detailLines.push(dim(`└─ +${running.length - maxLines} more agents...`));
  }

  return { headerPart, detailLines };
}
