import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTodosLine } from '../dist/render/todos-line.js';
import { DEFAULT_CONFIG } from '../dist/config.js';

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

function ctxWithStaleness(todos, todosFormat, { mtimeBackdated = true, enabled = true, withStartTime = true } = {}) {
  const NOW = Date.now();
  return {
    transcript: {
      todos: todos.map((t) => ({
        ...t,
        startTime: withStartTime && t.status === 'in_progress'
          ? new Date(NOW - DEFAULT_CONFIG.display.staleness.todoMs - 60_000)
          : t.startTime,
      })),
      tools: [],
      agents: [],
      transcriptMtimeMs: mtimeBackdated ? NOW - DEFAULT_CONFIG.display.staleness.sessionIdleMs - 60_000 : NOW,
    },
    config: {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        todosFormat,
        staleness: { ...DEFAULT_CONFIG.display.staleness, enabled },
      },
      colors: DEFAULT_CONFIG.colors,
    },
  };
}

function stripAll(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

test('todosFormat=line: stale in_progress todo is demoted with ? marker and (stale?) suffix', () => {
  const todos = [
    { content: 'doing it', status: 'in_progress' },
    { content: 'will do', status: 'pending' },
  ];
  const out = renderTodosLine(ctxWithStaleness(todos, 'line'));
  assert.ok(typeof out === 'string');
  const stripped = stripAll(out);
  assert.ok(stripped.startsWith('? '), `expected '?' marker on stale row: ${stripped}`);
  assert.ok(stripped.endsWith('(stale?)'), `expected stale suffix: ${stripped}`);
  assert.ok(!stripped.includes('▸'), 'stale row must not carry play glyph');
});

test('todosFormat=checklist: stale in_progress todo is demoted', () => {
  const todos = [
    { content: 'wrote plan', status: 'completed' },
    { content: 'building feature', status: 'in_progress' },
    { content: 'add tests', status: 'pending' },
  ];
  const out = renderTodosLine(ctxWithStaleness(todos, 'checklist'));
  const lines = out.split('\n').map(stripAll);
  // The in_progress line is the second one.
  const inProgressLine = lines.find((l) => l.includes('building feature'));
  assert.ok(inProgressLine, 'in_progress row must be present');
  assert.ok(inProgressLine.startsWith('? '), `expected '?' marker on stale row: ${inProgressLine}`);
  assert.ok(inProgressLine.includes('(stale?)'), `expected stale suffix: ${inProgressLine}`);
});

test('todosFormat=line: todo without startTime is not demoted (no anchor to age against)', () => {
  const todos = [
    { content: 'doing it', status: 'in_progress' },
  ];
  const ctx = ctxWithStaleness(todos, 'line', { withStartTime: false });
  const out = renderTodosLine(ctx);
  const stripped = stripAll(out);
  assert.ok(stripped.startsWith('▸ '), `expected normal play glyph: ${stripped}`);
  assert.ok(!stripped.includes('(stale?)'), `expected no stale suffix: ${stripped}`);
});

test('todosFormat=line: staleness.enabled=false disables demotion', () => {
  const todos = [
    { content: 'doing it', status: 'in_progress' },
  ];
  const ctx = ctxWithStaleness(todos, 'line', { enabled: false });
  const out = renderTodosLine(ctx);
  const stripped = stripAll(out);
  assert.ok(stripped.startsWith('▸ '), `expected normal play glyph when disabled: ${stripped}`);
  assert.ok(!stripped.includes('(stale?)'));
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
