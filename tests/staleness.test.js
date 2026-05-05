import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentStale, isTodoStale } from '../dist/render/staleness.js';
import { DEFAULT_CONFIG } from '../dist/config.js';

const NOW = new Date('2025-01-01T12:00:00.000Z').getTime();
const AGENT_MS = DEFAULT_CONFIG.display.staleness.agentMs;
const TODO_MS = DEFAULT_CONFIG.display.staleness.todoMs;
const IDLE_MS = DEFAULT_CONFIG.display.staleness.sessionIdleMs;

function cfg(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    display: {
      ...DEFAULT_CONFIG.display,
      staleness: { ...DEFAULT_CONFIG.display.staleness, ...overrides },
    },
  };
}

function transcript(extra = {}) {
  return {
    tools: [],
    agents: [],
    todos: [],
    transcriptMtimeMs: NOW - IDLE_MS - 1,
    ...extra,
  };
}

function runningAgent(ageMs = AGENT_MS + 1) {
  return {
    id: 'a1',
    type: 'general-purpose',
    status: 'running',
    startTime: new Date(NOW - ageMs),
  };
}

function inProgressTodo(ageMs = TODO_MS + 1) {
  return {
    content: 'doing thing',
    status: 'in_progress',
    startTime: new Date(NOW - ageMs),
  };
}

describe('isAgentStale', () => {
  test('all three gates trip -> stale', () => {
    assert.equal(isAgentStale(runningAgent(), transcript(), cfg(), NOW), true);
  });

  test('age below threshold -> not stale', () => {
    const agent = runningAgent(AGENT_MS - 1);
    assert.equal(isAgentStale(agent, transcript(), cfg(), NOW), false);
  });

  test('session idle below threshold -> not stale', () => {
    const t = transcript({ transcriptMtimeMs: NOW - IDLE_MS + 1 });
    assert.equal(isAgentStale(runningAgent(), t, cfg(), NOW), false);
  });

  test('newer tool activity (third-gate save) -> not stale', () => {
    const agent = runningAgent();
    const t = transcript({
      tools: [
        {
          id: 't1',
          name: 'Read',
          status: 'completed',
          startTime: new Date(agent.startTime.getTime() + 1000),
          endTime: new Date(agent.startTime.getTime() + 2000),
        },
      ],
    });
    assert.equal(isAgentStale(agent, t, cfg(), NOW), false);
  });

  test('older tool activity does not save', () => {
    const agent = runningAgent();
    const t = transcript({
      tools: [
        {
          id: 't1',
          name: 'Read',
          status: 'completed',
          startTime: new Date(agent.startTime.getTime() - 5000),
          endTime: new Date(agent.startTime.getTime() - 4000),
        },
      ],
    });
    assert.equal(isAgentStale(agent, t, cfg(), NOW), true);
  });

  test('enabled: false -> never stale even when all gates trip', () => {
    assert.equal(
      isAgentStale(runningAgent(), transcript(), cfg({ enabled: false }), NOW),
      false,
    );
  });

  test('completed agent -> not stale', () => {
    const agent = { ...runningAgent(), status: 'completed' };
    assert.equal(isAgentStale(agent, transcript(), cfg(), NOW), false);
  });

  test('transcriptMtimeMs undefined -> not stale (idle=0)', () => {
    const t = transcript({ transcriptMtimeMs: undefined });
    assert.equal(isAgentStale(runningAgent(), t, cfg(), NOW), false);
  });

  test('off-by-one: agent age exactly at threshold -> stale (>=)', () => {
    const agent = runningAgent(AGENT_MS);
    const t = transcript({ transcriptMtimeMs: NOW - IDLE_MS });
    assert.equal(isAgentStale(agent, t, cfg(), NOW), true);
  });

  test('off-by-one: idle exactly at threshold -> stale (>=)', () => {
    const t = transcript({ transcriptMtimeMs: NOW - IDLE_MS });
    assert.equal(isAgentStale(runningAgent(), t, cfg(), NOW), true);
  });

  test('tool starting exactly at agent.startTime counts as newer (>=) -> not stale', () => {
    const agent = runningAgent();
    const t = transcript({
      tools: [
        {
          id: 't1',
          name: 'Read',
          status: 'running',
          startTime: new Date(agent.startTime.getTime()),
        },
      ],
    });
    assert.equal(isAgentStale(agent, t, cfg(), NOW), false);
  });
});

describe('isTodoStale', () => {
  test('all three gates trip -> stale', () => {
    assert.equal(isTodoStale(inProgressTodo(), transcript(), cfg(), NOW), true);
  });

  test('todo without startTime -> not stale', () => {
    const todo = { content: 'x', status: 'in_progress' };
    assert.equal(isTodoStale(todo, transcript(), cfg(), NOW), false);
  });

  test('age below threshold -> not stale', () => {
    assert.equal(
      isTodoStale(inProgressTodo(TODO_MS - 1), transcript(), cfg(), NOW),
      false,
    );
  });

  test('session idle below threshold -> not stale', () => {
    const t = transcript({ transcriptMtimeMs: NOW - IDLE_MS + 1 });
    assert.equal(isTodoStale(inProgressTodo(), t, cfg(), NOW), false);
  });

  test('newer tool activity -> not stale (third-gate)', () => {
    const todo = inProgressTodo();
    const t = transcript({
      tools: [
        {
          id: 't1',
          name: 'Read',
          status: 'running',
          startTime: new Date(todo.startTime.getTime() + 1000),
        },
      ],
    });
    assert.equal(isTodoStale(todo, t, cfg(), NOW), false);
  });

  test('enabled: false -> never stale', () => {
    assert.equal(
      isTodoStale(inProgressTodo(), transcript(), cfg({ enabled: false }), NOW),
      false,
    );
  });

  test('non in_progress todo -> not stale', () => {
    const todo = { ...inProgressTodo(), status: 'pending' };
    assert.equal(isTodoStale(todo, transcript(), cfg(), NOW), false);
  });

  test('off-by-one: todo age exactly at threshold -> stale', () => {
    const t = transcript({ transcriptMtimeMs: NOW - IDLE_MS });
    assert.equal(isTodoStale(inProgressTodo(TODO_MS), t, cfg(), NOW), true);
  });
});
