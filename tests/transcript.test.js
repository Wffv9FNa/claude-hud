import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseTranscript } from '../dist/transcript.js';

// Build a transcript JSONL from an array of entry objects and write to a
// temp file. Returns the path (caller is responsible for cleanup).
async function writeTranscript(entries) {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-transcript-'));
  const filePath = path.join(dir, 'transcript.jsonl');
  await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
  return { dir, filePath };
}

describe('parseTranscript: background-agent tracking', () => {
  test('Async agent launch tool_result keeps status as running', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bg_1',
              name: 'Task',
              input: { subagent_type: 'general-purpose', description: 'run in background' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bg_1',
              content:
                'Async agent launched successfully\nagentId: a8de3dd\nThe agent is running in the background.',
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(result.agents[0].status, 'running', 'background-launch ACK must not mark completion');
      assert.equal(result.agents[0].endTime, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('array-shaped tool_result with Async launch text keeps status running', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bg_2',
              name: 'Task',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bg_2',
              content: [
                {
                  type: 'text',
                  text: 'Async agent launched successfully\nagentId: abc123',
                },
              ],
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents[0].status, 'running');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('task-notification string-content message flips status to completed', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bg_3',
              name: 'Task',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bg_3',
              content:
                'Async agent launched successfully\nagentId: bgid001\nrunning',
            },
          ],
        },
      },
      // Completion arrives as a user-role message with STRING-shaped content
      // (not an array) carrying the <task-notification> block.
      {
        timestamp: '2024-01-01T00:00:30.000Z',
        message: {
          content:
            '<task-notification>\n<task-id>bgid001</task-id>\n<tool-use-id>toolu_bg_3</tool-use-id>\n<status>completed</status>\n</task-notification>',
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(result.agents[0].status, 'completed');
      assert.ok(result.agents[0].endTime instanceof Date);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('task-notification without tool-use-id falls back to agentId map', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bg_4',
              name: 'Task',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bg_4',
              content: 'Async agent launched successfully\nagentId: fallbackid\nrunning',
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:30.000Z',
        message: {
          content:
            '<task-notification>\n<task-id>fallbackid</task-id>\n<status>completed</status>\n</task-notification>',
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents[0].status, 'completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('underscore-variant task_id/tool_use_id tags also resolve', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bg_5',
              name: 'Task',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:01.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bg_5',
              content: 'Async agent launched successfully\nagentId: underid\nrunning',
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:30.000Z',
        message: {
          content:
            '<task-notification><task_id>underid</task_id><tool_use_id>toolu_bg_5</tool_use_id><status>completed</status></task-notification>',
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents[0].status, 'completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('foreground agent tool_result (non-async) marks completion directly', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_fg_1',
              name: 'Task',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:15.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_fg_1',
              content:
                'Here is the exploration summary.\nI found three relevant files...',
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(result.agents[0].status, 'completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('completion report quoting "Async agent launched" elsewhere still marks completion', async () => {
    // A legitimate foreground completion that cites the earlier launch
    // message in its body must NOT be misclassified as a background-launch
    // ACK. Guarded by startsWith() on trimmed text (not .includes()).
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_fg_2',
              name: 'Task',
              input: { subagent_type: 'critic' },
            },
          ],
        },
      },
      {
        timestamp: '2024-01-01T00:00:20.000Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_fg_2',
              content:
                'Investigation complete.\n\nEarlier I observed that the message "Async agent launched successfully" appeared in the logs at 14:22, which suggested...\n\nFinal recommendation: ship the fix.',
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(
        result.agents[0].status,
        'completed',
        'quoted "Async agent launched" text must not keep the agent running',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('Agent tool is tracked as agent (not tool)', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_agent',
              name: 'Agent',
              input: { subagent_type: 'explore' },
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(result.tools.length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('proxy_Task tool is tracked as agent', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_proxy_task',
              name: 'proxy_Task',
              input: { subagent_type: 'explore', description: 'via proxy' },
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.agents.length, 1);
      assert.equal(result.agents[0].type, 'explore');
      assert.equal(result.tools.length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('proxy_TodoWrite replaces latest todos', async () => {
    const entries = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todos',
              name: 'proxy_TodoWrite',
              input: {
                todos: [
                  { content: 'First', status: 'pending' },
                  { content: 'Second', status: 'in_progress' },
                ],
              },
            },
          ],
        },
      },
    ];

    const { dir, filePath } = await writeTranscript(entries);
    try {
      const result = await parseTranscript(filePath);
      assert.equal(result.todos.length, 2);
      assert.equal(result.todos[0].content, 'First');
      assert.equal(result.todos[1].status, 'in_progress');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
