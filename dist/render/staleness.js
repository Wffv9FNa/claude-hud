/**
 * Returns true if any tool in the transcript started or ended at or after
 * the given start time. Used as the third gate of staleness detection: a
 * long-running parent agent whose subagents are still emitting tool activity
 * should NOT be marked stale.
 */
function hasNewerToolActivity(start, transcript) {
    const t = start.getTime();
    for (const tool of transcript.tools) {
        if (tool.startTime.getTime() >= t)
            return true;
        if (tool.endTime && tool.endTime.getTime() >= t)
            return true;
    }
    return false;
}
/**
 * Three-gate staleness predicate for running agents:
 *   1. Per-entity age >= config.display.staleness.agentMs
 *   2. Session idle >= config.display.staleness.sessionIdleMs
 *   3. No tool activity at or after agent.startTime
 *
 * All boundary comparisons use `>=` and numeric `.getTime()` values.
 */
export function isAgentStale(agent, transcript, config, now = Date.now()) {
    const s = config.display.staleness;
    if (!s.enabled)
        return false;
    if (agent.status !== 'running')
        return false;
    const agentAge = now - agent.startTime.getTime();
    const idle = transcript.transcriptMtimeMs != null
        ? now - transcript.transcriptMtimeMs
        : 0;
    if (!(agentAge >= s.agentMs && idle >= s.sessionIdleMs))
        return false;
    if (hasNewerToolActivity(agent.startTime, transcript))
        return false;
    return true;
}
/**
 * Three-gate staleness predicate for in_progress todos. Todos with no
 * `startTime` are never marked stale (we have no anchor to age against).
 */
export function isTodoStale(todo, transcript, config, now = Date.now()) {
    const s = config.display.staleness;
    if (!s.enabled)
        return false;
    if (todo.status !== 'in_progress')
        return false;
    if (!todo.startTime)
        return false;
    const todoAge = now - todo.startTime.getTime();
    const idle = transcript.transcriptMtimeMs != null
        ? now - transcript.transcriptMtimeMs
        : 0;
    if (!(todoAge >= s.todoMs && idle >= s.sessionIdleMs))
        return false;
    if (hasNewerToolActivity(todo.startTime, transcript))
        return false;
    return true;
}
//# sourceMappingURL=staleness.js.map