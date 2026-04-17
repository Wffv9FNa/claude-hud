import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdaptiveBarWidth, detectTerminalColumns } from '../dist/utils/terminal.js';

describe('getAdaptiveBarWidth', () => {
  let originalColumns;
  let originalStderrColumns;
  let originalEnvColumns;

  beforeEach(() => {
    originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    originalStderrColumns = Object.getOwnPropertyDescriptor(process.stderr, 'columns');
    originalEnvColumns = process.env.COLUMNS;
    delete process.env.COLUMNS;
  });

  afterEach(() => {
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns);
    } else {
      delete process.stdout.columns;
    }
    if (originalStderrColumns) {
      Object.defineProperty(process.stderr, 'columns', originalStderrColumns);
    } else {
      delete process.stderr.columns;
    }
    if (originalEnvColumns !== undefined) {
      process.env.COLUMNS = originalEnvColumns;
    } else {
      delete process.env.COLUMNS;
    }
  });

  test('returns 4 for narrow terminal (<60 cols)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 4);
  });

  test('returns 4 for exactly 59 cols', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 59, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 4);
  });

  test('returns 6 for medium terminal (60-99 cols)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 70, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 6);
  });

  test('returns 6 for exactly 60 cols', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 60, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 6);
  });

  test('returns 6 for exactly 99 cols', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 99, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 6);
  });

  test('returns 10 for wide terminal (>=100 cols)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 10);
  });

  test('returns 10 for exactly 100 cols', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 100, configurable: true });
    assert.equal(getAdaptiveBarWidth(), 10);
  });

  test('falls back to COLUMNS env var when stdout.columns unavailable', () => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: undefined, configurable: true });
    process.env.COLUMNS = '70';
    assert.equal(getAdaptiveBarWidth(), 6);
  });
});

describe('detectTerminalColumns', () => {
  let originalColumns;
  let originalStderrColumns;
  let originalEnvColumns;

  beforeEach(() => {
    originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    originalStderrColumns = Object.getOwnPropertyDescriptor(process.stderr, 'columns');
    originalEnvColumns = process.env.COLUMNS;
    delete process.env.COLUMNS;
  });

  afterEach(() => {
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns);
    } else {
      delete process.stdout.columns;
    }
    if (originalStderrColumns) {
      Object.defineProperty(process.stderr, 'columns', originalStderrColumns);
    } else {
      delete process.stderr.columns;
    }
    if (originalEnvColumns !== undefined) {
      process.env.COLUMNS = originalEnvColumns;
    } else {
      delete process.env.COLUMNS;
    }
  });

  test('prefers stdout.columns when available', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 142, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: 80, configurable: true });
    process.env.COLUMNS = '60';
    assert.equal(detectTerminalColumns(), 142);
  });

  test('falls back to stderr.columns when stdout.columns is unavailable', () => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: 117, configurable: true });
    process.env.COLUMNS = '60';
    assert.equal(detectTerminalColumns(), 117);
  });

  test('falls back to COLUMNS env when stdout and stderr are unavailable', () => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: undefined, configurable: true });
    process.env.COLUMNS = '90';
    assert.equal(detectTerminalColumns(), 90);
  });

  test('ignores non-finite stdout.columns and uses next source', () => {
    Object.defineProperty(process.stdout, 'columns', { value: NaN, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: 100, configurable: true });
    assert.equal(detectTerminalColumns(), 100);
  });

  test('ignores zero/negative stdout.columns and uses next source', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 0, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: 80, configurable: true });
    assert.equal(detectTerminalColumns(), 80);
  });

  test('ignores malformed COLUMNS env and attempts /dev/tty fallback', () => {
    // When everything else is undefined, the helper attempts an stty fallback.
    // In Node's test runner without a controlling tty, that call returns null
    // so detectTerminalColumns() reports null. Just verify it does not throw
    // and does not pick up the malformed env.
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    Object.defineProperty(process.stderr, 'columns', { value: undefined, configurable: true });
    process.env.COLUMNS = 'not-a-number';
    const result = detectTerminalColumns();
    // Either null (no tty) or a positive number (tty reachable); never NaN
    // and never picks up the malformed env string.
    assert.ok(
      result === null || (typeof result === 'number' && Number.isFinite(result) && result > 0),
      `expected null or positive finite number, got ${result}`,
    );
  });
});
