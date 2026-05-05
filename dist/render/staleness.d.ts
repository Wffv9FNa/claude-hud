import type { HudConfig } from '../config.js';
import type { AgentEntry, TodoItem, TranscriptData } from '../types.js';
/**
 * Three-gate staleness predicate for running agents:
 *   1. Per-entity age >= config.display.staleness.agentMs
 *   2. Session idle >= config.display.staleness.sessionIdleMs
 *   3. No tool activity at or after agent.startTime
 *
 * All boundary comparisons use `>=` and numeric `.getTime()` values.
 */
export declare function isAgentStale(agent: AgentEntry, transcript: TranscriptData, config: HudConfig, now?: number): boolean;
/**
 * Three-gate staleness predicate for in_progress todos. Todos with no
 * `startTime` are never marked stale (we have no anchor to age against).
 */
export declare function isTodoStale(todo: TodoItem, transcript: TranscriptData, config: HudConfig, now?: number): boolean;
//# sourceMappingURL=staleness.d.ts.map