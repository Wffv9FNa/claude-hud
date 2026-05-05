/**
 * Compute the canonical sha256 hash for a transcript path.
 *
 * The path is resolved to an absolute form before hashing so callers passing
 * relative paths still produce a stable identifier. This hash is the single
 * source of truth shared by the transcript cache and the override store; if
 * the two ever diverge, the slash command would write override files the
 * renderer never reads.
 */
export declare function getTranscriptHash(transcriptPath: string): string;
/** Cache file path for a parsed transcript. */
export declare function getTranscriptCachePath(transcriptPath: string, homeDir: string): string;
/** Override file path for a transcript (used by `--clear` and parser). */
export declare function getOverrideFilePath(transcriptPath: string, homeDir: string): string;
//# sourceMappingURL=transcript-paths.d.ts.map