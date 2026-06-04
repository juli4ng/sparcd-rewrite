import { describe, it, expect } from 'vitest';
import { parseCsvRows, serializeCsvRows } from '../src/index';
import { fixture } from './fixtures';

describe('CSV round-trip (writer byte shape is the contract)', () => {
  for (const set of ['java-v016', 'sparcd-web-v016', 'uploader-empty-v016'] as const) {
    for (const file of ['deployments.csv', 'media.csv', 'observations.csv']) {
      it(`${set}/${file} re-serializes byte-for-byte`, () => {
        const text = fixture(set, file);
        expect(serializeCsvRows(parseCsvRows(text))).toBe(text);
      });
    }
  }

  it('parses an empty observations.csv to zero rows', () => {
    expect(parseCsvRows('')).toEqual([]);
    expect(serializeCsvRows([])).toBe('');
  });

  it('round-trips embedded commas, quotes, and newlines inside quoted fields', () => {
    const rows = [['a,b', 'c"d', 'e\nf'], ['x', 'y', 'z']];
    expect(parseCsvRows(serializeCsvRows(rows))).toEqual(rows);
  });

  it('preserves a quoted empty field but drops a truly blank line', () => {
    expect(parseCsvRows('"a",""\n\n"b",""\n')).toEqual([
      ['a', ''],
      ['b', ''],
    ]);
  });
});
