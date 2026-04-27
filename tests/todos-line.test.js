import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTodosLine } from '../dist/render/todos-line.js';

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function ctxWith(todos, todosFormat = 'line') {
  return {
    transcript: { todos },
    config: {
      display: { todosFormat },
      colors: { label: 'dim' },
    },
  };
}

test('todosFormat=checklist: three-status input produces three lines with correct glyphs', () => {
  const todos = [
    { content: 'wrote plan', status: 'completed' },
    { content: 'building feature', status: 'in_progress' },
    { content: 'add tests', status: 'pending' },
  ];
  const out = renderTodosLine(ctxWith(todos, 'checklist'));
  assert.ok(typeof out === 'string', 'should return string');
  const lines = out.split('\n');
  assert.equal(lines.length, 3, `expected 3 lines, got ${lines.length}: ${JSON.stringify(lines)}`);
  const stripped = lines.map(stripAnsi);
  assert.ok(stripped[0].startsWith('\u2713 '), `row 0 should start with check glyph: ${stripped[0]}`);
  assert.ok(stripped[0].includes('wrote plan'));
  assert.ok(stripped[1].startsWith('\u25B8 '), `row 1 should start with play glyph: ${stripped[1]}`);
  assert.ok(stripped[1].includes('building feature'));
  assert.ok(stripped[2].startsWith('\u25CB '), `row 2 should start with circle glyph: ${stripped[2]}`);
  assert.ok(stripped[2].includes('add tests'));
});

test('todosFormat=checklist: only-completed input produces one line', () => {
  const todos = [
    { content: 'shipped it', status: 'completed' },
    { content: 'shipped again', status: 'completed' },
  ];
  const out = renderTodosLine(ctxWith(todos, 'checklist'));
  assert.ok(typeof out === 'string');
  const lines = out.split('\n').filter((l) => stripAnsi(l).trim() !== '');
  // Implementation may emit a trailing progress summary line. Require at least
  // the completed glyph line to be present.
  const checkmarkLines = lines.filter((l) => stripAnsi(l).startsWith('\u2713 '));
  assert.equal(checkmarkLines.length, 1, 'exactly one completed-glyph line');
  assert.ok(stripAnsi(checkmarkLines[0]).includes('shipped again'), 'should show most-recent completed');
});

test('todosFormat=checklist: only-pending input produces one line', () => {
  const todos = [
    { content: 'todo one', status: 'pending' },
    { content: 'todo two', status: 'pending' },
  ];
  const out = renderTodosLine(ctxWith(todos, 'checklist'));
  assert.ok(typeof out === 'string');
  const lines = out.split('\n').filter((l) => stripAnsi(l).trim() !== '');
  const circleLines = lines.filter((l) => stripAnsi(l).startsWith('\u25CB '));
  assert.equal(circleLines.length, 1, 'exactly one pending-glyph line');
  assert.ok(stripAnsi(circleLines[0]).includes('todo one'), 'should show first pending');
});

test('todosFormat=checklist: empty todos returns null', () => {
  const out = renderTodosLine(ctxWith([], 'checklist'));
  assert.equal(out, null);
});

test('todosFormat=line (default): produces single-line output (in_progress present)', () => {
  const todos = [
    { content: 'did it', status: 'completed' },
    { content: 'doing it', status: 'in_progress' },
    { content: 'will do', status: 'pending' },
  ];
  const out = renderTodosLine(ctxWith(todos, 'line'));
  assert.ok(typeof out === 'string');
  assert.ok(!out.includes('\n'), 'line mode must be single line');
  assert.ok(stripAnsi(out).includes('doing it'));
  assert.ok(stripAnsi(out).includes('(1/3)'));
});

test('todosFormat=line: byte-identical whether format is omitted or set to line', () => {
  const todos = [
    { content: 'wrote plan', status: 'completed' },
    { content: 'building feature', status: 'in_progress' },
    { content: 'add tests', status: 'pending' },
  ];
  // Omitted -> default behaviour.
  const ctxNoFormat = {
    transcript: { todos },
    config: { display: {}, colors: { label: 'dim' } },
  };
  const outDefault = renderTodosLine(ctxNoFormat);
  const outExplicit = renderTodosLine(ctxWith(todos, 'line'));
  assert.equal(outDefault, outExplicit, 'omitting todosFormat should match explicit "line"');
});

test('todosFormat=line: all-complete produces one line, byte-equivalent across default/explicit', () => {
  const todos = [
    { content: 'a', status: 'completed' },
    { content: 'b', status: 'completed' },
  ];
  const ctxNoFormat = {
    transcript: { todos },
    config: { display: {}, colors: { label: 'dim' } },
  };
  const outDefault = renderTodosLine(ctxNoFormat);
  const outExplicit = renderTodosLine(ctxWith(todos, 'line'));
  assert.equal(outDefault, outExplicit);
  assert.ok(typeof outDefault === 'string');
  assert.ok(!outDefault.includes('\n'), 'line mode is single line even for all-complete');
});
