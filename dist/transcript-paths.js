import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
/**
 * Compute the canonical sha256 hash for a transcript path.
 *
 * The path is resolved to an absolute form before hashing so callers passing
 * relative paths still produce a stable identifier. This hash is the single
 * source of truth shared by the transcript cache and the override store; if
 * the two ever diverge, the slash command would write override files the
 * renderer never reads.
 */
export function getTranscriptHash(transcriptPath) {
    return createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
}
/** Cache file path for a parsed transcript. */
export function getTranscriptCachePath(transcriptPath, homeDir) {
    return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${getTranscriptHash(transcriptPath)}.json`);
}
/** Override file path for a transcript (used by `--clear` and parser). */
export function getOverrideFilePath(transcriptPath, homeDir) {
    return path.join(getHudPluginDir(homeDir), 'overrides', `${getTranscriptHash(transcriptPath)}.json`);
}
//# sourceMappingURL=transcript-paths.js.map