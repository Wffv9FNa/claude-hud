export interface ClearArgs {
    transcript: string;
    targets: Set<'agents' | 'todos'>;
    quiet: boolean;
}
export interface ParseResult {
    ok: boolean;
    args?: ClearArgs;
    error?: string;
    /** True iff `--clear` was present at all (so caller knows to enter write-mode). */
    isClearMode: boolean;
}
/**
 * Parse `--clear=<targets>`, `--transcript=<path>`, `--quiet` from argv.
 *
 * Returns `isClearMode = false` when no `--clear` flag is present so the caller
 * falls through to the normal stdin/render path.
 */
export declare function parseClearArgs(argv: readonly string[]): ParseResult;
export interface RunClearDeps {
    homeDir?: string;
    now?: () => number;
}
/**
 * Apply a `--clear` request: read existing override (if any), monotonically
 * advance the requested timestamps, atomically write the merged file, and
 * roundtrip-verify the result. Stdout MUST remain empty on every code path -
 * all messages go to stderr.
 */
export declare function runClear(args: ClearArgs, deps?: RunClearDeps): number;
//# sourceMappingURL=run-clear.d.ts.map