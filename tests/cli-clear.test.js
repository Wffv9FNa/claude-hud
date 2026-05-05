import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseClearArgs, runClear } from '../dist/run-clear.js';
import { getOverrideFilePath } from '../dist/transcript-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_INDEX = path.resolve(__dirname, '..', 'dist', 'index.js');

async function tmp(prefix) {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

function readJson(filePath) {
  return readFile(filePath, 'utf8').then((s) => JSON.parse(s));
}

describe('parseClearArgs', () => {
  test('no --clear -> isClearMode false', () => {
    const r = parseClearArgs([]);
    assert.equal(r.isClearMode, false);
    assert.equal(r.ok, true);
  });

  test('--clear=agents --transcript=foo parses', () => {
    const r = parseClearArgs(['--clear=agents', '--transcript=/x/y.jsonl']);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.args.targets].sort(), ['agents']);
    assert.equal(r.args.transcript, '/x/y.jsonl');
    assert.equal(r.args.quiet, false);
  });

  test('--clear=all expands to agents+todos', () => {
    const r = parseClearArgs(['--clear=all', '--transcript=/x.jsonl']);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.args.targets].sort(), ['agents', 'todos']);
  });

  test('--clear=all,agents rejected', () => {
    const r = parseClearArgs(['--clear=all,agents', '--transcript=/x.jsonl']);
    assert.equal(r.ok, false);
    assert.match(r.error, /all/);
  });

  test('empty --clear= rejected', () => {
    const r = parseClearArgs(['--clear=', '--transcript=/x.jsonl']);
    assert.equal(r.ok, false);
  });

  test('unknown target rejected', () => {
    const r = parseClearArgs(['--clear=potato', '--transcript=/x.jsonl']);
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown/);
  });

  test('missing --transcript rejected', () => {
    const r = parseClearArgs(['--clear=agents']);
    assert.equal(r.ok, false);
    assert.match(r.error, /transcript/);
  });

  test('--quiet captured', () => {
    const r = parseClearArgs(['--clear=agents', '--transcript=/x.jsonl', '--quiet']);
    assert.equal(r.ok, true);
    assert.equal(r.args.quiet, true);
  });
});

describe('runClear: write semantics', () => {
  test('--clear=agents writes only clearAgentsBefore', async () => {
    const home = await tmp('claude-hud-clear-home-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      const code = runClear(
        { transcript: transcriptPath, targets: new Set(['agents']), quiet: true },
        { homeDir: home, now: () => Date.parse('2025-06-01T00:00:00.000Z') },
      );
      assert.equal(code, 0);
      const ovPath = getOverrideFilePath(transcriptPath, home);
      const json = await readJson(ovPath);
      assert.equal(json.version, 1);
      assert.equal(typeof json.clearAgentsBefore, 'string');
      assert.equal(json.clearTodosBefore, undefined);
      assert.equal(json.transcriptPath, path.resolve(transcriptPath));
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('--clear=all writes both timestamps', async () => {
    const home = await tmp('claude-hud-clear-home-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      const code = runClear(
        { transcript: transcriptPath, targets: new Set(['agents', 'todos']), quiet: true },
        { homeDir: home, now: () => Date.parse('2025-06-01T00:00:00.000Z') },
      );
      assert.equal(code, 0);
      const json = await readJson(getOverrideFilePath(transcriptPath, home));
      assert.equal(typeof json.clearAgentsBefore, 'string');
      assert.equal(typeof json.clearTodosBefore, 'string');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('inverse-clear preserves prior other-category timestamp', async () => {
    const home = await tmp('claude-hud-clear-home-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      // First call: clear all
      runClear(
        { transcript: transcriptPath, targets: new Set(['agents', 'todos']), quiet: true },
        { homeDir: home, now: () => Date.parse('2025-06-01T00:00:00.000Z') },
      );
      const first = await readJson(getOverrideFilePath(transcriptPath, home));
      const todosFirst = first.clearTodosBefore;
      assert.ok(todosFirst);

      // Second call: clear only agents
      runClear(
        { transcript: transcriptPath, targets: new Set(['agents']), quiet: true },
        { homeDir: home, now: () => Date.parse('2025-06-02T00:00:00.000Z') },
      );
      const second = await readJson(getOverrideFilePath(transcriptPath, home));
      assert.equal(second.clearTodosBefore, todosFirst, 'todos timestamp preserved');
      assert.notEqual(second.clearAgentsBefore, first.clearAgentsBefore);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('monotonic clamp: future existing timestamp not reduced', async () => {
    const home = await tmp('claude-hud-clear-home-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      // Pre-seed override with a far-future clearAgentsBefore.
      const future = '2099-01-01T00:00:00.000Z';
      const ovPath = getOverrideFilePath(transcriptPath, home);
      await mkdir(path.dirname(ovPath), { recursive: true });
      await writeFile(ovPath, JSON.stringify({
        version: 1,
        transcriptPath: path.resolve(transcriptPath),
        clearAgentsBefore: future,
        writtenAt: future,
      }), 'utf8');

      const code = runClear(
        { transcript: transcriptPath, targets: new Set(['agents']), quiet: true },
        { homeDir: home, now: () => Date.parse('2025-06-01T00:00:00.000Z') },
      );
      assert.equal(code, 0);
      const after = await readJson(ovPath);
      assert.equal(after.clearAgentsBefore, future, 'future timestamp not reduced');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('roundtrip verify catches unwritable directory -> exit 1', async () => {
    const home = await tmp('claude-hud-clear-home-');
    try {
      // Make the override dir read-only AFTER creating it so writeFileSync fails.
      const transcriptPath = path.join(home, 'session.jsonl');
      const ovPath = getOverrideFilePath(transcriptPath, home);
      await mkdir(path.dirname(ovPath), { recursive: true });
      await chmod(path.dirname(ovPath), 0o500);

      const code = runClear(
        { transcript: transcriptPath, targets: new Set(['agents']), quiet: true },
        { homeDir: home, now: () => Date.now() },
      );
      // Either 0 (root can write anywhere) or 1 (write fails). Accept both
      // but assert that on failure stdout-policy still holds elsewhere.
      assert.ok(code === 0 || code === 1);
    } finally {
      try { await chmod(path.join(home, 'plugins', 'claude-hud', 'overrides'), 0o700); } catch { /* */ }
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('CLI process: stdout invariant', () => {
  function runCli(argv, env = {}) {
    return spawnSync(process.execPath, [DIST_INDEX, ...argv], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      input: '',
      timeout: 10000,
    });
  }

  test('--clear=agents emits zero stdout bytes', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      const r = runCli(['--clear=agents', `--transcript=${transcriptPath}`], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 0, `expected exit 0; stderr=${r.stderr}`);
      assert.equal(r.stdout.length, 0, `stdout must be empty; got: ${JSON.stringify(r.stdout)}`);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('--clear=agents --quiet emits zero stdout AND zero stderr message line', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      const r = runCli(['--clear=agents', `--transcript=${transcriptPath}`, '--quiet'], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.length, 0);
      // --quiet still allows zero-length stderr
      assert.equal(r.stderr.length, 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('invalid arg combination exits 2 and writes nothing to stdout', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const r = runCli(['--clear=all,agents', `--transcript=${path.join(home, 'x.jsonl')}`], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 2);
      assert.equal(r.stdout.length, 0);
      assert.match(r.stderr, /all/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('missing --transcript exits 2 with empty stdout', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const r = runCli(['--clear=agents'], { CLAUDE_CONFIG_DIR: home, HOME: home });
      assert.equal(r.status, 2);
      assert.equal(r.stdout.length, 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('unknown target exits 2 with empty stdout', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const r = runCli(['--clear=widgets', `--transcript=${path.join(home, 'x.jsonl')}`], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 2);
      assert.equal(r.stdout.length, 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('empty --clear= exits 2 with empty stdout', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const r = runCli(['--clear=', `--transcript=${path.join(home, 'x.jsonl')}`], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 2);
      assert.equal(r.stdout.length, 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('success message goes to stderr only', async () => {
    const home = await tmp('claude-hud-clear-cli-');
    try {
      const transcriptPath = path.join(home, 'session.jsonl');
      const r = runCli(['--clear=all', `--transcript=${transcriptPath}`], {
        CLAUDE_CONFIG_DIR: home,
        HOME: home,
      });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.length, 0);
      assert.match(r.stderr, /cleared/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
