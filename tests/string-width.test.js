import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCJKCharacter,
  isZeroWidth,
  getCharWidth,
  stringWidth,
  stripAnsi,
  truncateToWidth,
  padToWidth,
  sliceByWidth,
} from '../dist/utils/string-width.js';

test('isCJKCharacter: detects Korean Hangul syllables', () => {
  assert.equal(isCJKCharacter('안'.codePointAt(0)), true);
  assert.equal(isCJKCharacter('녕'.codePointAt(0)), true);
  assert.equal(isCJKCharacter('하'.codePointAt(0)), true);
});

test('isCJKCharacter: detects CJK Unified Ideographs (Chinese)', () => {
  assert.equal(isCJKCharacter('中'.codePointAt(0)), true);
  assert.equal(isCJKCharacter('文'.codePointAt(0)), true);
});

test('isCJKCharacter: detects Japanese Hiragana and Katakana', () => {
  assert.equal(isCJKCharacter('あ'.codePointAt(0)), true);
  assert.equal(isCJKCharacter('カ'.codePointAt(0)), true);
});

test('isCJKCharacter: detects full-width ASCII', () => {
  assert.equal(isCJKCharacter('Ａ'.codePointAt(0)), true);
  assert.equal(isCJKCharacter('１'.codePointAt(0)), true);
});

test('isCJKCharacter: returns false for ASCII characters', () => {
  assert.equal(isCJKCharacter('A'.codePointAt(0)), false);
  assert.equal(isCJKCharacter('1'.codePointAt(0)), false);
  assert.equal(isCJKCharacter(' '.codePointAt(0)), false);
});

test('isZeroWidth: detects zero-width space', () => {
  assert.equal(isZeroWidth(0x200b), true);
});

test('isZeroWidth: detects zero-width joiner', () => {
  assert.equal(isZeroWidth(0x200d), true);
});

test('isZeroWidth: detects combining diacritical marks', () => {
  assert.equal(isZeroWidth(0x0300), true);
  assert.equal(isZeroWidth(0x0301), true);
});

test('isZeroWidth: returns false for regular characters', () => {
  assert.equal(isZeroWidth('a'.codePointAt(0)), false);
  assert.equal(isZeroWidth('가'.codePointAt(0)), false);
});

test('getCharWidth: returns 2 for CJK characters', () => {
  assert.equal(getCharWidth('한'), 2);
  assert.equal(getCharWidth('中'), 2);
});

test('getCharWidth: returns 1 for ASCII characters', () => {
  assert.equal(getCharWidth('A'), 1);
  assert.equal(getCharWidth('z'), 1);
});

test('getCharWidth: returns 0 for empty string', () => {
  assert.equal(getCharWidth(''), 0);
});

test('stringWidth: calculates width of ASCII string', () => {
  assert.equal(stringWidth('hello'), 5);
});

test('stringWidth: calculates width of Korean string', () => {
  assert.equal(stringWidth('안녕하세요'), 10);
});

test('stringWidth: calculates width of mixed ASCII and CJK', () => {
  assert.equal(stringWidth('hi안녕'), 6);
});

test('stringWidth: strips ANSI codes before calculating', () => {
  assert.equal(stringWidth('\x1b[31mhello\x1b[0m'), 5);
  assert.equal(stringWidth('\x1b[1m안녕\x1b[0m'), 4);
});

test('stringWidth: returns 0 for empty string', () => {
  assert.equal(stringWidth(''), 0);
});

test('stringWidth: returns 0 for null/undefined', () => {
  assert.equal(stringWidth(''), 0);
});

test('stringWidth: calculates width of Japanese text', () => {
  assert.equal(stringWidth('こんにちは'), 10);
});

test('stringWidth: calculates width of Chinese text', () => {
  assert.equal(stringWidth('你好世界'), 8);
});

test('stripAnsi: strips SGR sequences', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
});

test('stripAnsi: strips bold sequences', () => {
  assert.equal(stripAnsi('\x1b[1mbold\x1b[0m'), 'bold');
});

test('stripAnsi: strips multiple sequences', () => {
  assert.equal(stripAnsi('\x1b[1m\x1b[31mboldred\x1b[0m'), 'boldred');
});

test('stripAnsi: returns unchanged string without ANSI', () => {
  assert.equal(stripAnsi('hello'), 'hello');
});

test('truncateToWidth: returns string unchanged if within width', () => {
  assert.equal(truncateToWidth('hello', 10), 'hello');
});

test('truncateToWidth: truncates ASCII string with ellipsis', () => {
  assert.equal(truncateToWidth('hello world', 8), 'hello...');
});

test('truncateToWidth: truncates Korean string correctly', () => {
  assert.equal(truncateToWidth('안녕하세요', 7), '안녕...');
});

test('truncateToWidth: truncates mixed CJK/ASCII correctly', () => {
  assert.equal(truncateToWidth('hi안녕하세요', 9), 'hi안녕...');
});

test('truncateToWidth: handles maxWidth of 0', () => {
  assert.equal(truncateToWidth('hello', 0), '');
});

test('truncateToWidth: handles empty string', () => {
  assert.equal(truncateToWidth('', 10), '');
});

test('truncateToWidth: handles string exactly at width', () => {
  assert.equal(truncateToWidth('hello', 5), 'hello');
});

test('truncateToWidth: uses custom suffix', () => {
  assert.equal(truncateToWidth('hello world', 8, '\u2026'), 'hello w\u2026');
});

test('truncateToWidth: does not break CJK characters', () => {
  assert.equal(truncateToWidth('안녕하세요', 5), '안...');
});

test('padToWidth: pads ASCII string to width', () => {
  assert.equal(padToWidth('hi', 5), 'hi   ');
});

test('padToWidth: pads CJK string correctly', () => {
  assert.equal(padToWidth('안녕', 6), '안녕  ');
});

test('padToWidth: does not pad if already at width', () => {
  assert.equal(padToWidth('hello', 5), 'hello');
});

test('padToWidth: does not pad if exceeding width', () => {
  assert.equal(padToWidth('hello world', 5), 'hello world');
});

test('sliceByWidth: slices ASCII string by width', () => {
  assert.equal(sliceByWidth('hello', 0, 3), 'hel');
});

test('sliceByWidth: slices CJK string by width', () => {
  assert.equal(sliceByWidth('안녕하', 0, 4), '안녕');
});

test('sliceByWidth: does not split CJK character', () => {
  assert.equal(sliceByWidth('안녕', 0, 3), '안');
});

test('sliceByWidth: handles empty string', () => {
  assert.equal(sliceByWidth('', 0, 5), '');
});
