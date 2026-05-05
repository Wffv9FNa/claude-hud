import type { TranscriptData } from './types.js';
/**
 * On-disk override schema. Written by the `--clear` CLI mode and read at
 * parse-finalisation time to drop stuck running agents and in_progress todos.
 */
export interface OverrideFile {
    version: number;
    transcriptPath: string;
    clearAgentsBefore?: string;
    clearTodosBefore?: string;
    writtenAt: string;
}
/**
 * Read the override file for a transcript. Returns `null` for any failure
 * (missing file, malformed JSON, wrong schema). Override read failures are
 * always silent so that a corrupt file never prevents the HUD from rendering.
 */
export declare function readOverride(transcriptPath: string, homeDir?: string): OverrideFile | null;
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
export declare function applyOverrides(data: TranscriptData, override: OverrideFile | null): TranscriptData;
//# sourceMappingURL=overrides.d.ts.map