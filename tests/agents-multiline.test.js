import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAgentsMultiLine,
  getShortAgentName,
  getAgentCode,
  formatDurationPadded,
} from '../dist/render/agents-multiline.js';

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function makeAgent(type, model, startTimeMs, description) {
  return {
    id: `${type}-${startTimeMs}`,
    type,
    model,
    description,
    status: 'running',
    startTime: new Date(startTimeMs),
    endTime: undefined,
  };
}

function withFixedNow(ms, fn) {
  const original = Date.now;
  Date.now = () => ms;
  try {
    fn();
  } finally {
    Date.now = original;
  }
}

test('multiline: no running agents returns empty', () => {
  const { headerPart, detailLines } = renderAgentsMultiLine([]);
  assert.equal(detailLines.length, 0);
  assert.equal(headerPart, '');
});

test('multiline: completed-only returns empty', () => {
  const completed = { ...makeAgent('explore', 'haiku', 0), status: 'completed' };
  const { detailLines } = renderAgentsMultiLine([completed]);
  assert.equal(detailLines.length, 0);
});

test('multiline: single agent uses lower-right prefix', () => {
  withFixedNow(1_000_000, () => {
    const agent = makeAgent('explore', 'haiku', 1_000_000 - 30_000, 'analyzing patterns');
    const { detailLines } = renderAgentsMultiLine([agent]);
    assert.equal(detailLines.length, 1);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.startsWith('\u2514\u2500 '), `expected line to start with lower-right tree prefix: ${stripped}`);
    assert.ok(stripped.includes('explore'), `expected short name in line: ${stripped}`);
    assert.ok(stripped.includes('analyzing patterns'), `expected description in line: ${stripped}`);
  });
});

test('multiline: two agents use mid-tee then lower-right in freshest-first order', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agentA = makeAgent('architect', 'opus', now - 120_000, 'older');
    const agentB = makeAgent('explore', 'haiku', now - 10_000, 'newer');
    const { detailLines } = renderAgentsMultiLine([agentA, agentB]);
    assert.equal(detailLines.length, 2);
    const first = stripAnsi(detailLines[0]);
    const second = stripAnsi(detailLines[1]);
    assert.ok(first.startsWith('\u251C\u2500'), `expected first line to start with mid-tee prefix: ${first}`);
    assert.ok(first.includes('explore'), `freshest agent (B/explore) should appear first: ${first}`);
    assert.ok(second.startsWith('\u2514\u2500'), `expected second line to start with lower-right prefix: ${second}`);
    assert.ok(second.includes('architect'), `older agent (A/architect) should appear second: ${second}`);
  });
});

test('multiline: header shows count', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agents = [
      makeAgent('explore', 'haiku', now - 5_000, 'a'),
      makeAgent('architect', 'opus', now - 15_000, 'b'),
      makeAgent('executor', 'sonnet', now - 25_000, 'c'),
    ];
    const { headerPart } = renderAgentsMultiLine(agents);
    assert.equal(stripAnsi(headerPart), 'agents:3');
  });
});

test('multiline: overflow indicator renders', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agents = [
      makeAgent('explore', 'haiku', now - 5_000, 'a'),
      makeAgent('architect', 'opus', now - 15_000, 'b'),
      makeAgent('executor', 'sonnet', now - 25_000, 'c'),
      makeAgent('planner', 'haiku', now - 35_000, 'd'),
    ];
    const { detailLines } = renderAgentsMultiLine(agents, 2);
    assert.equal(detailLines.length, 3);
    const lastStripped = stripAnsi(detailLines[detailLines.length - 1]);
    assert.ok(lastStripped.includes('+2 more agents...'), `expected overflow indicator: ${lastStripped}`);
  });
});

test('multiline: model-tier casing', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const opusAgent = makeAgent('architect', 'opus', now - 5_000, 'x');
    const haikuAgent = makeAgent('explore', 'haiku', now - 10_000, 'y');
    const { detailLines } = renderAgentsMultiLine([opusAgent, haikuAgent]);
    const stripped = detailLines.map(stripAnsi);
    assert.ok(stripped.some((line) => line.includes(' A architect')), `expected uppercase A for opus: ${stripped.join(' | ')}`);
    assert.ok(stripped.some((line) => line.includes(' e explore')), `expected lowercase e for haiku: ${stripped.join(' | ')}`);
  });
});

test('multiline: duration padding', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const fresh = makeAgent('explore', 'haiku', now - 5_000, 'five');
    const mid = makeAgent('architect', 'haiku', now - 45_000, 'forty-five');
    const old = makeAgent('executor', 'haiku', now - 180_000, 'three minutes');
    const { detailLines } = renderAgentsMultiLine([fresh, mid, old]);
    const stripped = detailLines.map(stripAnsi);
    assert.ok(stripped[0].includes('    '), `5s row should carry four-space duration: ${stripped[0]}`);
    assert.ok(stripped[1].includes(' 45s'), `45s row should carry ' 45s': ${stripped[1]}`);
    assert.ok(stripped[2].includes('  3m'), `3min row should carry '  3m': ${stripped[2]}`);
  });
});

test('multiline: duration colour escalation - red at 6 minutes', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 6 * 60_000, 'working');
    const { detailLines } = renderAgentsMultiLine([agent]);
    assert.ok(detailLines[0].includes('\x1b[31m'), `expected RED ANSI for 6-minute agent: ${JSON.stringify(detailLines[0])}`);
  });
});

test('multiline: duration colour escalation - green at 1 minute', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 60_000, 'working');
    const { detailLines } = renderAgentsMultiLine([agent]);
    assert.ok(detailLines[0].includes('\x1b[32m'), `expected GREEN ANSI for 1-minute agent: ${JSON.stringify(detailLines[0])}`);
  });
});

test('multiline: CJK-aware truncation', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const longKorean = '\uC548\uB155\uD558\uC138\uC694 '.repeat(20);
    const agent = makeAgent('explore', 'haiku', now - 5_000, longKorean);
    const { detailLines } = renderAgentsMultiLine([agent]);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes('...'), `expected truncation ellipsis for CJK overflow: ${stripped}`);
  });
});

test('multiline: description fallback to placeholder', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 5_000, undefined);
    const { detailLines } = renderAgentsMultiLine([agent]);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes('...'), `expected '...' fallback for missing description: ${stripped}`);
  });
});

test('multiline: namespace prefix stripped in short name', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('anything:general-purpose', 'haiku', now - 5_000, 'ns');
    const { detailLines } = renderAgentsMultiLine([agent]);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes('general'), `expected abbreviated short name 'general' in line: ${stripped}`);
  });
});

test('multiline: unknown agent type first-letter fallback', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('my-custom-thing', 'sonnet', now - 5_000, 'custom');
    const { detailLines } = renderAgentsMultiLine([agent]);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes(' m '), `expected lowercase 'm' code for non-opus unknown agent: ${stripped}`);
    assert.ok(stripped.includes('my-custom-thing'), `expected full short name in line (padEnd does not truncate): ${stripped}`);
  });
});

// Snapshot-style parity test. The exact column widths reflect Stage 4's
// padEnd(12) on the short name and OMC's formatDurationPadded (4 chars) with
// two spaces between the duration column and the description.
test('multiline: snapshot parity for three-agent tree', () => {
  const T0 = 1_000_000;
  withFixedNow(T0, () => {
    const agents = [
      { id: 'e1', type: 'explore', model: 'haiku', status: 'running',
        startTime: new Date(T0 - 45_000), description: 'searching for test files' },
      { id: 'a1', type: 'architect', model: 'opus', status: 'running',
        startTime: new Date(T0 - 120_000), description: 'analyzing architecture patterns' },
      { id: 'x1', type: 'executor', model: 'sonnet', status: 'running',
        startTime: new Date(T0 - 60_000), description: 'implementing validation logic' },
    ];
    const { headerPart, detailLines } = renderAgentsMultiLine(agents, 5);
    const snapshot = stripAnsi([headerPart, ...detailLines].join('\n'));
    const expected = [
      'agents:3',
      '\u251C\u2500 e explore      45s  searching for test files',
      '\u251C\u2500 e executor      1m  implementing validation logic',
      '\u2514\u2500 A architect     2m  analyzing architecture patterns',
    ].join('\n');
    assert.equal(snapshot, expected);
  });
});

test('getShortAgentName strips namespace and applies abbreviations', () => {
  assert.equal(getShortAgentName('general-purpose'), 'general');
  assert.equal(getShortAgentName('anything:explore'), 'explore');
  assert.equal(getShortAgentName('my-custom-agent'), 'my-custom-agent');
});

test('getAgentCode honours model-tier casing', () => {
  assert.equal(getAgentCode('explore', 'haiku'), 'e');
  assert.equal(getAgentCode('architect', 'opus'), 'A');
  assert.equal(getAgentCode('general-purpose', 'sonnet'), 'g');
  assert.equal(getAgentCode('explore'), 'e');
});

test('formatDurationPadded matches OMC contract', () => {
  assert.equal(formatDurationPadded(5_000), '    ');
  assert.equal(formatDurationPadded(45_000), ' 45s');
  assert.equal(formatDurationPadded(180_000), '  3m');
  assert.equal(formatDurationPadded(660_000), ' 11m');
});

test('multiline: uses wider description budget when terminalWidth is provided', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const longDesc = 'Plan fork patch for HUD layout across every relevant file'; // 58 chars
    const agent = makeAgent('explore', 'haiku', now - 45_000, longDesc);
    const { detailLines } = renderAgentsMultiLine([agent], 5, 180);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes(longDesc), `wide terminal should render full description: ${stripped}`);
    assert.ok(!stripped.includes('...'), `wide terminal should not truncate: ${stripped}`);
    assert.ok(stripped.length <= 180, `rendered line visual length must fit within 180: ${stripped.length}`);
  });
});

test('multiline: falls back to 45-char default when terminalWidth is null or undefined', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const longDesc = 'a'.repeat(80);
    const agent = makeAgent('explore', 'haiku', now - 45_000, longDesc);

    const nullWidth = stripAnsi(renderAgentsMultiLine([agent], 5, null).detailLines[0]);
    const undefWidth = stripAnsi(renderAgentsMultiLine([agent], 5).detailLines[0]);

    assert.ok(nullWidth.includes('...'), `null width should truncate: ${nullWidth}`);
    assert.ok(undefWidth.includes('...'), `undefined width should truncate: ${undefWidth}`);

    const truncatedPart = nullWidth.split('  ').pop(); // last column after the two-space gap
    assert.equal(truncatedPart.length, 45, `truncated description should be exactly 45 chars: "${truncatedPart}"`);
  });
});

test('multiline: falls back to 45-char default when terminalWidth is below floor (60)', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const longDesc = 'a'.repeat(80);
    const agent = makeAgent('explore', 'haiku', now - 45_000, longDesc);

    const narrowLine = stripAnsi(renderAgentsMultiLine([agent], 5, 50).detailLines[0]);
    const nullLine = stripAnsi(renderAgentsMultiLine([agent], 5, null).detailLines[0]);

    assert.equal(narrowLine, nullLine, 'below-floor width should render identically to null');
  });
});

test('multiline: stale agent uses ? marker, dim colours, and (stale?) suffix', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 60_000, 'analysing');
    const stale = { staleIds: new Set([agent.id]), marker: '?', suffix: ' (stale?)' };
    const { detailLines } = renderAgentsMultiLine([agent], 5, null, stale);
    assert.equal(detailLines.length, 1);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes(' ? explore'), `expected '?' marker in stale row: ${stripped}`);
    assert.ok(stripped.includes('   ?'), `expected '?' duration freeze: ${stripped}`);
    assert.ok(stripped.endsWith(' (stale?)'), `expected stale suffix: ${stripped}`);
    // The whole row should be wrapped in DIM (\x1b[2m).
    assert.ok(detailLines[0].startsWith('\x1b[2m'), `expected DIM wrap on stale row: ${JSON.stringify(detailLines[0])}`);
    // Should NOT contain the duration colour escape used for non-stale rows.
    assert.ok(!detailLines[0].includes('\x1b[31m') && !detailLines[0].includes('\x1b[32m') && !detailLines[0].includes('\x1b[33m'),
      `stale row should not carry green/yellow/red duration colour: ${JSON.stringify(detailLines[0])}`);
  });
});

test('multiline: non-stale long-running agent renders normally', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 6 * 60_000, 'still active');
    const stale = { staleIds: new Set(), marker: '?', suffix: ' (stale?)' };
    const { detailLines } = renderAgentsMultiLine([agent], 5, null, stale);
    const stripped = stripAnsi(detailLines[0]);
    assert.ok(stripped.includes(' e explore'), `non-stale row keeps normal code: ${stripped}`);
    assert.ok(!stripped.endsWith(' (stale?)'), `non-stale row must not carry stale suffix: ${stripped}`);
  });
});

test('multiline: non-stale agents sort before stale before truncation (4 fresh + 5 stale, max=5)', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    // 5 stale agents, freshest of which is now-100s. 4 non-stale agents older
    // (start at now - 5min). Without the sort, the freshest-first ordering
    // would push all 4 non-stale ones below the cut.
    const stale = [
      makeAgent('stale-a', 'haiku', now - 100_000, 'sa'),
      makeAgent('stale-b', 'haiku', now - 110_000, 'sb'),
      makeAgent('stale-c', 'haiku', now - 120_000, 'sc'),
      makeAgent('stale-d', 'haiku', now - 130_000, 'sd'),
      makeAgent('stale-e', 'haiku', now - 140_000, 'se'),
    ];
    const fresh = [
      makeAgent('fresh-a', 'haiku', now - 300_000, 'fa'),
      makeAgent('fresh-b', 'haiku', now - 310_000, 'fb'),
      makeAgent('fresh-c', 'haiku', now - 320_000, 'fc'),
      makeAgent('fresh-d', 'haiku', now - 330_000, 'fd'),
    ];
    const all = [...stale, ...fresh];
    const staleIds = new Set(stale.map((a) => a.id));
    const result = renderAgentsMultiLine(all, 5, null, { staleIds, marker: '?', suffix: ' (stale?)' });
    // 5 lines kept = 4 fresh + 1 stale (no overflow indicator? running.length=9 > 5 -> overflow line added)
    // detailLines = 5 visible rows + 1 overflow.
    assert.equal(result.detailLines.length, 6);
    const visibleStripped = result.detailLines.slice(0, 5).map(stripAnsi).join('\n');
    for (const f of fresh) {
      assert.ok(visibleStripped.includes(f.description), `fresh agent ${f.description} must remain visible: ${visibleStripped}`);
    }
    assert.ok(result.detailLines[5].includes('+4 more agents...'), `expected overflow indicator showing 4 hidden: ${result.detailLines[5]}`);
  });
});

test('multiline: omitting staleness options leaves rendering unchanged (legacy callers)', () => {
  const now = 1_000_000;
  withFixedNow(now, () => {
    const agent = makeAgent('explore', 'haiku', now - 5_000, 'desc');
    const a = renderAgentsMultiLine([agent]).detailLines[0];
    const b = renderAgentsMultiLine([agent], 5, null).detailLines[0];
    assert.equal(a, b);
    assert.ok(!stripAnsi(a).includes('(stale?)'));
  });
});
