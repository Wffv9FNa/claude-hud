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

const CYAN = '\x1b[36m';
const DEFAULT_MAX_DESC_WIDTH = 45;

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
  maxLines = 5
): MultiLineAgentsResult {
  const filtered = agents.filter((a) => a.status === 'running');
  if (filtered.length === 0) {
    return { headerPart: '', detailLines: [] };
  }

  const running = sortByFreshest(filtered);
  const headerPart = `agents:${CYAN}${running.length}${RESET}`;
  const displayCount = Math.min(running.length, maxLines);
  const now = Date.now();
  const detailLines: string[] = [];

  running.slice(0, maxLines).forEach((agent, index) => {
    const isLast = index === displayCount - 1 && running.length <= maxLines;
    const prefix = isLast ? '└─' : '├─';
    const code = getAgentCode(agent.type, agent.model);
    const color = getModelTierColor(agent.model);
    const shortName = getShortAgentName(agent.type).padEnd(12);
    const durationMs = now - agent.startTime.getTime();
    const duration = formatDurationPadded(durationMs);
    const durationColor = getDurationColor(durationMs);
    const desc = agent.description || '...';
    const truncatedDesc = truncateToWidth(desc, DEFAULT_MAX_DESC_WIDTH);

    detailLines.push(
      `${dim(prefix)} ${color}${code}${RESET} ${dim(shortName)}${durationColor}${duration}${RESET}  ${truncatedDesc}`
    );
  });

  if (running.length > maxLines) {
    detailLines.push(dim(`└─ +${running.length - maxLines} more agents...`));
  }

  return { headerPart, detailLines };
}
