import type { RenderContext, AgentEntry } from '../types.js';
import { yellow, green, magenta, label, dim } from './colors.js';
import { renderAgentsMultiLine } from './agents-multiline.js';
import { isAgentStale } from './staleness.js';

const MAX_RECENT_COMPLETED = 2;
const MAX_AGENTS_SHOWN = 3;

export function renderAgentsLine(
  ctx: RenderContext,
  terminalWidth: number | null = null
): string | null {
  const format = ctx.config?.display?.agentsFormat ?? 'compact';
  if (format === 'multiline') {
    return renderAgentsMultilineWrapped(ctx, terminalWidth);
  }
  return renderAgentsCompact(ctx);
}

function renderAgentsCompact(ctx: RenderContext): string | null {
  const { agents } = ctx.transcript;
  const colors = ctx.config?.colors;

  const runningAgents = agents.filter((a) => a.status === 'running');
  const recentCompleted = agents
    .filter((a) => a.status === 'completed')
    .slice(-MAX_RECENT_COMPLETED);

  const seen = new Set<string>();
  const toShow = [...runningAgents, ...recentCompleted]
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .slice(-MAX_AGENTS_SHOWN);

  if (toShow.length === 0) {
    return null;
  }

  const now = Date.now();
  const staleIds = new Set<string>();
  if (ctx.config?.display?.staleness) {
    for (const a of toShow) {
      if (isAgentStale(a, ctx.transcript, ctx.config, now)) {
        staleIds.add(a.id);
      }
    }
  }
  const suffix = ctx.config?.display?.staleness?.suffix ?? ' (stale?)';

  const lines: string[] = [];
  for (const agent of toShow) {
    lines.push(formatAgent(agent, colors, staleIds.has(agent.id), suffix));
  }
  return lines.join('\n');
}

function renderAgentsMultilineWrapped(
  ctx: RenderContext,
  terminalWidth: number | null = null
): string | null {
  const { agents } = ctx.transcript;

  const maxLines = ctx.config?.display?.agentsMaxLines ?? 5;
  const now = Date.now();
  const staleIds = new Set<string>();
  if (ctx.config?.display?.staleness) {
    for (const a of agents) {
      if (a.status === 'running' && isAgentStale(a, ctx.transcript, ctx.config, now)) {
        staleIds.add(a.id);
      }
    }
  }
  const marker = ctx.config?.display?.staleness?.marker ?? '?';
  const suffix = ctx.config?.display?.staleness?.suffix ?? ' (stale?)';

  // Multiline mode shows only running agents; renderAgentsMultiLine filters
  // internally to status === 'running' and caps detail rows by `maxLines`.
  // Pass all agents through so the header reports the true running count.
  const { headerPart, detailLines } = renderAgentsMultiLine(
    agents,
    maxLines,
    terminalWidth,
    { staleIds, marker, suffix },
  );

  if (detailLines.length === 0) {
    return null;
  }

  return [headerPart, ...detailLines].join('\n');
}

function getStatusIcon(
  status: AgentEntry['status']
): string {
  switch (status) {
    case 'running':
      return yellow('◐');
    case 'completed':
    default:
      return green('✓');
  }
}

function formatAgent(
  agent: AgentEntry,
  colors?: RenderContext['config']['colors'],
  isStale: boolean = false,
  suffix: string = ' (stale?)'
): string {
  if (isStale) {
    const statusIcon = dim('?');
    const type = dim(agent.type);
    const model = agent.model ? dim(`[${agent.model}]`) : '';
    const desc = agent.description ? dim(`: ${truncateDesc(agent.description)}`) : '';
    const elapsed = dim('(?)');
    return `${statusIcon} ${type}${model ? ` ${model}` : ''}${desc} ${elapsed}${dim(suffix)}`;
  }
  const statusIcon = getStatusIcon(agent.status);
  const type = magenta(agent.type);
  const model = agent.model ? label(`[${agent.model}]`, colors) : '';
  const desc = agent.description
    ? label(`: ${truncateDesc(agent.description)}`, colors)
    : '';
  const elapsed = formatElapsed(agent);

  return `${statusIcon} ${type}${model ? ` ${model}` : ''}${desc} ${label(`(${elapsed})`, colors)}`;
}

function truncateDesc(desc: string, maxLen: number = 40): string {
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen - 3) + '...';
}

function formatElapsed(agent: AgentEntry): string {
  const now = Date.now();
  const start = agent.startTime.getTime();
  const end = agent.endTime?.getTime() ?? now;
  const ms = Math.max(0, end - start);

  if (ms < 1000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;

  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  if (mins < 60) return `${mins}m ${secs}s`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}
