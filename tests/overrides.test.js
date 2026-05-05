import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyOverrides, readOverride } from '../dist/overrides.js';
import { getOverrideFilePath } from '../dist/transcript-paths.js';
import { parseTranscript } from '../dist/transcript.js';

function makeData(overrides = {}) {
  return {
    tools: [],
    agents: [
      { id: 'a-old', type: 't', status: 'running', startTime: new Date('2024-01-01T00:00:00.000Z') },
      { id: 'a-new', type: 't', status: 'running', startTime: new Date('2024-01-02T00:00:00.000Z') },
      { id: 'a-done', type: 't', status: 'completed', startTime: new Date('2024-01-01T00:00:00.000Z'), endTime: new Date('2024-01-01T00:01:00.000Z') },
    ],
    todos: [
      { content: 'old in_progress', status: 'in_progress', startTime: new Date('2024-01-01T00:00:00.000Z') },
      { content: 'new in_progress', status: 'in_progress', startTime: new Date('2024-01-02T00:00:00.000Z') },
      { content: 'no startTime', status: 'in_progress' },
      { content: 'pending one', status: 'pending' },
      { content: 'completed one', status: 'completed' },
    ],
    ...overrides,
  };
}

describe('applyOverrides: passthrough cases', () => {
  test('null override returns input reference unchanged', () => {
    const data = makeData();
    const out = applyOverrides(data, null);
    assert.equal(out, data);
    assert.equal(out.agents, data.agents);
    assert.equal(out.todos, data.todos);
  });

  test('readOverride returns null for missing file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-ov-'));
    try {
      // Use a nonexistent transcript path under a sandbox HOME so override path is missing.
      const result = readOverride(path.join(dir, 'nope.jsonl'), dir);
      assert.equal(result, null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('readOverride returns null for malformed JSON (no throw)', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'claude-hud-ov-home-'));
    try {
      const transcriptPath = '/tmp/some-fake-transcript.jsonl';
      const ovPath = getOverrideFilePath(transcriptPath, home);
      await mkdir(path.dirname(ovPath), { recursive: true });
      await writeFile(ovPath, 'this is not { json', 'utf8');
      const result = readOverride(transcriptPath, home);
      assert.equal(result, null);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('applyOverrides: filtering', () => {
  test('clearAgentsBefore drops only older running agents', () => {
    const data = makeData();
    const out = applyOverrides(data, {
      version: 1,
      transcriptPath: '/x',
      clearAgentsBefore: '2024-01-01T12:00:00.000Z',
      writtenAt: '2024-01-02T00:00:00.000Z',
    });
    assert.equal(out.agents.length, 2);
    assert.ok(out.agents.find((a) => a.id === 'a-new'));
    assert.ok(out.agents.find((a) => a.id === 'a-done'), 'completed agents survive');
    assert.equal(out.agents.find((a) => a.id === 'a-old'), undefined);
    // todos untouched
    assert.equal(out.todos.length, data.todos.length);
  });

  test('clearTodosBefore drops older in_progress todos; missing startTime survives', () => {
    const data = makeData();
    const out = applyOverrides(data, {
      version: 1,
      transcriptPath: '/x',
      clearTodosBefore: '2024-01-01T12:00:00.000Z',
      writtenAt: '2024-01-02T00:00:00.000Z',
    });
    const contents = out.todos.map((t) => t.content);
    assert.ok(!contents.includes('old in_progress'));
    assert.ok(contents.includes('new in_progress'));
    assert.ok(contents.includes('no startTime'), 'no startTime survives');
    assert.ok(contents.includes('pending one'));
    assert.ok(contents.includes('completed one'));
  });

  test('PURITY: input arrays are unchanged; output arrays are new references', () => {
    const data = makeData();
    const agentsRef = data.agents;
    const todosRef = data.todos;
    const agentsSnap = data.agents.slice();
    const todosSnap = data.todos.slice();

    const out = applyOverrides(data, {
      version: 1,
      transcriptPath: '/x',
      clearAgentsBefore: '2024-01-01T12:00:00.000Z',
      clearTodosBefore: '2024-01-01T12:00:00.000Z',
      writtenAt: '2024-01-02T00:00:00.000Z',
    });

    // Input references unchanged in identity AND content.
    assert.equal(data.agents, agentsRef);
    assert.equal(data.todos, todosRef);
    assert.deepEqual(data.agents, agentsSnap);
    assert.deepEqual(data.todos, todosSnap);

    // Output arrays are different references.
    assert.notEqual(out.agents, data.agents);
    assert.notEqual(out.todos, data.todos);
    assert.notEqual(out, data);
  });
});

describe('parseTranscript override integration', () => {
  async function writeTranscript(entries) {
    const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-ov-int-'));
    const filePath = path.join(dir, 'transcript.jsonl');
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    return { dir, filePath };
  }

  test('override file applied on cache-hit path', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'claude-hud-home-'));
    const origHome = process.env.HOME;
    const origUserprofile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_old',
              name: 'Task',
              input: { subagent_type: 'general-purpose', description: 'stuck' },
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      // First parse - no override yet, should populate the cache.
      const first = await parseTranscript(filePath);
      assert.equal(first.agents.length, 1);
      assert.equal(first.agents[0].id, 'toolu_old');

      // Write the override file.
      const ovPath = getOverrideFilePath(filePath, home);
      await mkdir(path.dirname(ovPath), { recursive: true });
      await writeFile(ovPath, JSON.stringify({
        version: 1,
        transcriptPath: path.resolve(filePath),
        clearAgentsBefore: '2024-06-01T00:00:00.000Z',
        writtenAt: '2024-06-01T00:00:00.000Z',
      }), 'utf8');

      // Second parse - should hit cache AND apply override.
      const second = await parseTranscript(filePath);
      assert.equal(second.agents.length, 0, 'override must drop the running agent on cache-hit path');
      assert.ok(second.overridesApplied);
      assert.equal(second.overridesApplied.clearAgentsBefore, '2024-06-01T00:00:00.000Z');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
      if (origUserprofile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = origUserprofile;
    }
  });
});
