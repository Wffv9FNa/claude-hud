import * as fs from 'node:fs';
import * as os from 'node:os';
import { getOverrideFilePath } from './transcript-paths.js';
/**
 * Read the override file for a transcript. Returns `null` for any failure
 * (missing file, malformed JSON, wrong schema). Override read failures are
 * always silent so that a corrupt file never prevents the HUD from rendering.
 */
export function readOverride(transcriptPath, homeDir = os.homedir()) {
    let raw;
    try {
        const overridePath = getOverrideFilePath(transcriptPath, homeDir);
        raw = fs.readFileSync(overridePath, 'utf8');
    }
    catch {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return null;
        if (parsed.version !== 1)
            return null;
        if (typeof parsed.transcriptPath !== 'string')
            return null;
        if (typeof parsed.writtenAt !== 'string')
            return null;
        if (parsed.clearAgentsBefore != null && typeof parsed.clearAgentsBefore !== 'string')
            return null;
        if (parsed.clearTodosBefore != null && typeof parsed.clearTodosBefore !== 'string')
            return null;
        return {
            version: parsed.version,
            transcriptPath: parsed.transcriptPath,
            clearAgentsBefore: parsed.clearAgentsBefore,
            clearTodosBefore: parsed.clearTodosBefore,
            writtenAt: parsed.writtenAt,
        };
    }
    catch {
        return null;
    }
}
/**
 * Pure: returns a new `TranscriptData` (with new `agents`/`todos` arrays)
 * filtered per the override. Never mutates the input. When `override` is
 * `null` the original `data` reference is returned unchanged.
 *
 * Drops:
 * - running agents whose `startTime` is strictly before `clearAgentsBefore`.
 * - in_progress todos whose `startTime` is strictly before `clearTodosBefore`.
 *   Todos lacking a `startTime` are kept (treated as too new to confidently age out).
 */
export function applyOverrides(data, override) {
    if (!override)
        return data;
    const agentsCutoff = parseTimestamp(override.clearAgentsBefore);
    const todosCutoff = parseTimestamp(override.clearTodosBefore);
    if (agentsCutoff === null && todosCutoff === null) {
        return data;
    }
    const nextAgents = agentsCutoff !== null
        ? data.agents.filter((a) => !(a.status === 'running' && a.startTime.getTime() < agentsCutoff))
        : data.agents.slice();
    const nextTodos = todosCutoff !== null
        ? data.todos.filter((t) => !(t.status === 'in_progress' && t.startTime !== undefined && t.startTime.getTime() < todosCutoff))
        : data.todos.slice();
    const overridesApplied = {};
    if (override.clearAgentsBefore && agentsCutoff !== null) {
        overridesApplied.clearAgentsBefore = override.clearAgentsBefore;
    }
    if (override.clearTodosBefore && todosCutoff !== null) {
        overridesApplied.clearTodosBefore = override.clearTodosBefore;
    }
    return {
        ...data,
        agents: nextAgents,
        todos: nextTodos,
        overridesApplied,
    };
}
function parseTimestamp(iso) {
    if (!iso)
        return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
//# sourceMappingURL=overrides.js.map