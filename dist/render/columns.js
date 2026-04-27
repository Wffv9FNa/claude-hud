/**
 * Side-by-side column layout helper.
 *
 * Zips two newline-joined blocks of rendered section output into a single
 * aligned multi-line string separated by a visual separator (default ` │ `).
 *
 * All width calculations use visual (terminal column) width via
 * `stringWidth` / `truncateToWidth` from `src/utils/string-width.ts`, so
 * ANSI escapes and wide (CJK / emoji) glyphs are handled correctly. Raw
 * `.length` is never used for padding.
 *
 * The helper is protective: if a cell's visual width exceeds the column
 * budget it is truncated with an ellipsis. Callers should still size
 * upstream content to the column budget to avoid truncation artefacts.
 */
import { stringWidth, truncateToWidth } from "../utils/string-width.js";
const DEFAULT_SEPARATOR = " \u2502 "; // space + U+2502 BOX DRAWINGS LIGHT VERTICAL + space
const RESET = "\x1b[0m";
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
export function renderColumns(left, right, terminalWidth, separator = DEFAULT_SEPARATOR) {
    // Graceful empty-column handling: caller should normally skip column
    // layout in this case, but we return the other side verbatim so the
    // helper is safe to call unconditionally.
    if (left === "" && right === "")
        return "";
    if (left === "")
        return right;
    if (right === "")
        return left;
    const leftLines = left.split("\n");
    const rightLines = right.split("\n");
    const rowCount = Math.max(leftLines.length, rightLines.length);
    const sepWidth = stringWidth(separator);
    const totalBudget = Math.max(0, terminalWidth - sepWidth);
    const leftWidth = Math.floor(totalBudget / 2);
    const rightWidth = totalBudget - leftWidth;
    const out = [];
    for (let i = 0; i < rowCount; i++) {
        let l = leftLines[i] ?? "";
        let r = rightLines[i] ?? "";
        // Defensive truncation; upstream renderers should already size content
        // to the column budget but this catches anything that slips through.
        if (stringWidth(l) > leftWidth) {
            l = truncateToWidth(l, leftWidth);
        }
        if (stringWidth(r) > rightWidth) {
            r = truncateToWidth(r, rightWidth);
        }
        // Belt-and-braces RESET: if an upstream renderer leaves colour state
        // open, padding spaces or the separator would inherit the colour.
        const lWithReset = l + RESET;
        const rWithReset = r + RESET;
        // Pad LEFT cell on the right to the column width using visual width
        // (NOT .length, which would miscount ANSI escapes and wide glyphs).
        const leftPadCount = Math.max(0, leftWidth - stringWidth(lWithReset));
        const lPadded = lWithReset + " ".repeat(leftPadCount);
        // RIGHT cell is not right-padded; trailing whitespace is wasteful.
        out.push(lPadded + separator + rWithReset);
    }
    return out.join("\n");
}
//# sourceMappingURL=columns.js.map