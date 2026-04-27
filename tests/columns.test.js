import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderColumns } from '../dist/render/columns.js';
import { stringWidth } from '../dist/utils/string-width.js';

const SEP = ' \u2502 ';

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

test('renderColumns: both columns 3 lines equal width yields 3 rows with separator', () => {
  const left = ['aaa', 'bbb', 'ccc'].join('\n');
  const right = ['111', '222', '333'].join('\n');
  const out = renderColumns(left, right, 40);
  const rows = out.split('\n');
  assert.equal(rows.length, 3, 'should emit three rows');
  for (const row of rows) {
    assert.ok(row.includes(SEP), `each row should contain the separator: ${JSON.stringify(row)}`);
  }
});

test('renderColumns: left 4 lines, right 2 lines yields 4 rows with blank right on overflow rows', () => {
  const left = ['L1', 'L2', 'L3', 'L4'].join('\n');
  const right = ['R1', 'R2'].join('\n');
  const out = renderColumns(left, right, 40);
  const rows = out.split('\n');
  assert.equal(rows.length, 4, 'row count equals max of two column heights');

  // Rows 3 and 4 must still contain the separator but have no right-column content.
  const row3Stripped = stripAnsi(rows[2]);
  const row4Stripped = stripAnsi(rows[3]);
  assert.ok(row3Stripped.includes(SEP), 'row 3 should still have separator');
  assert.ok(row4Stripped.includes(SEP), 'row 4 should still have separator');
  assert.equal(row3Stripped.split(SEP)[1], '', 'row 3 right side should be empty');
  assert.equal(row4Stripped.split(SEP)[1], '', 'row 4 right side should be empty');
  // Row 1 and 2 should have content on the right.
  assert.equal(stripAnsi(rows[0]).split(SEP)[1], 'R1');
  assert.equal(stripAnsi(rows[1]).split(SEP)[1], 'R2');
});

test('renderColumns: ANSI colour codes in left column are preserved and padding uses visual width', () => {
  const ANSI_RED = '\x1b[31m';
  const ANSI_RESET = '\x1b[0m';
  const left = `${ANSI_RED}red${ANSI_RESET}`; // visual width 3
  const right = 'hi'; // visual width 2
  const terminalWidth = 20; // budget 17; leftWidth = 8, rightWidth = 9
  const out = renderColumns(left, right, terminalWidth);
  // ANSI sequence is preserved.
  assert.ok(out.includes(ANSI_RED), 'left ANSI colour escape should be preserved');
  // Visual row width should not exceed terminal width.
  for (const row of out.split('\n')) {
    assert.ok(stringWidth(row) <= terminalWidth, `row visual width must fit: ${stringWidth(row)} <= ${terminalWidth}`);
  }
  // Raw character length beats the visual width due to ANSI bytes, confirming
  // padding is computed by visual width, not .length.
  assert.ok(out.length > terminalWidth, 'raw length exceeds terminal width because ANSI bytes are non-visual');
});

test('renderColumns: wide glyph (emoji) pads to visual width', () => {
  // \uD83D\uDE80 is rocket emoji (not in our simple CJK ranges so stringWidth reports 1).
  // Use CJK (width 2) to exercise wide-glyph padding.
  const left = '\u4e2d\u6587'; // "中文", visual width 4
  const right = 'x';
  const terminalWidth = 20; // budget 17; leftWidth = 8
  const out = renderColumns(left, right, terminalWidth);
  const rows = out.split('\n');
  assert.equal(rows.length, 1);
  for (const row of rows) {
    assert.ok(stringWidth(row) <= terminalWidth, `row visual width fits: ${stringWidth(row)}`);
  }
  // Separator should start at column 8 (after the 4-wide CJK + 4 padding spaces).
  const stripped = stripAnsi(rows[0]);
  const sepIdx = stripped.indexOf(SEP);
  const leftPart = stripped.slice(0, sepIdx);
  assert.equal(stringWidth(leftPart), 8, 'left cell including padding should fill leftWidth');
});

test('renderColumns: overlong line in a column is truncated with ellipsis', () => {
  const left = 'a'.repeat(200);
  const right = 'y';
  const terminalWidth = 40; // budget 37; leftWidth = 18
  const out = renderColumns(left, right, terminalWidth);
  const stripped = stripAnsi(out);
  assert.ok(stripped.includes('...'), `overlong left cell should be truncated with ellipsis: ${stripped}`);
  for (const row of out.split('\n')) {
    assert.ok(stringWidth(row) <= terminalWidth, `row must still fit terminal width: ${stringWidth(row)}`);
  }
});

test('renderColumns: empty left returns right verbatim; empty right returns left verbatim', () => {
  assert.equal(renderColumns('', 'hello', 40), 'hello');
  assert.equal(renderColumns('hello', '', 40), 'hello');
  assert.equal(renderColumns('', '', 40), '');
});

test('renderColumns invariant fuzz: all emitted rows fit terminal width across mixed inputs', () => {
  const ANSI = '\x1b[31mred\x1b[0m';
  const EMOJI = '\u4e2d\u6587\u4e2d\u6587'; // CJK wide
  const ASCII_SHORT = 'hello';
  const ASCII_LONG = 'the quick brown fox jumps over the lazy dog '.repeat(5);
  const MIXED = `${ANSI} + ${EMOJI} tail`;
  const MULTI = ['line one', `${ANSI} line`, `tail ${EMOJI}`, 'final'].join('\n');

  const inputs = [ASCII_SHORT, ASCII_LONG, ANSI, EMOJI, MIXED, MULTI, '', 'single'];
  const widths = [60, 80, 100, 120, 160, 200];

  let rowsChecked = 0;
  for (const width of widths) {
    for (const left of inputs) {
      for (const right of inputs) {
        // The helper's documented contract for empty inputs is to return the
        // other side verbatim (no column layout at all). The width invariant
        // applies only to the true column-combined case, so skip empty pairs.
        if (left === '' || right === '') continue;
        const combined = renderColumns(left, right, width);
        if (combined === '') continue;
        for (const row of combined.split('\n')) {
          rowsChecked += 1;
          assert.ok(
            stringWidth(row) <= width,
            `invariant violated: visualLength ${stringWidth(row)} > terminalWidth ${width} for row ${JSON.stringify(row)} (left=${JSON.stringify(left)} right=${JSON.stringify(right)})`
          );
        }
      }
    }
  }
  assert.ok(rowsChecked > 100, `fuzz should check plenty of rows (checked ${rowsChecked})`);
});
