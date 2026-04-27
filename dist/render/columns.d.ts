/**
 * Render two newline-joined section outputs as side-by-side columns.
 *
 * @param left            Left column content (may contain ANSI and '\n').
 * @param right           Right column content (may contain ANSI and '\n').
 * @param terminalWidth   Total available width in terminal columns.
 * @param separator       Column separator (default ` │ `, visual width 3).
 * @returns               Newline-joined combined rows. If either input is
 *                        empty, returns the other verbatim.
 */
export declare function renderColumns(left: string, right: string, terminalWidth: number, separator?: string): string;
//# sourceMappingURL=columns.d.ts.map