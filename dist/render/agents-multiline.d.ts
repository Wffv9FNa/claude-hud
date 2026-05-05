/**
 * Multi-line agent renderer.
 *
 * Direct port of `omc-reference/src/hud/elements/agents.ts#renderAgentsMultiLine`
 * with the agent-code lookup intentionally stripped down to a small abbreviation
 * map; unknown agent types fall back to their first character (case set by model
 * tier).
 */
import type { AgentEntry } from '../types.js';
export interface MultiLineAgentsResult {
    headerPart: string;
    detailLines: string[];
}
export interface StalenessRenderOptions {
    staleIds: Set<string>;
    marker: string;
    suffix: string;
}
export declare function getShortAgentName(type: string): string;
export declare function getAgentCode(type: string, model?: string): string;
export declare function formatDurationPadded(durationMs: number): string;
export declare function renderAgentsMultiLine(agents: AgentEntry[], maxLines?: number, terminalWidth?: number | null, staleness?: StalenessRenderOptions): MultiLineAgentsResult;
//# sourceMappingURL=agents-multiline.d.ts.map