import { describe, it, expect } from 'vitest';
import { rangeSet, toggleIndex, burstIndexSet, isRangeFullySelected } from '../src/lib/selection';
import type { BurstGrouping } from '../src/lib/bursts';

describe('rangeSet', () => {
  it('builds an inclusive range regardless of direction', () => {
    expect([...rangeSet(2, 5)]).toEqual([2, 3, 4, 5]);
    expect([...rangeSet(5, 2)]).toEqual([2, 3, 4, 5]);
    expect([...rangeSet(4, 4)]).toEqual([4]);
  });
});

describe('toggleIndex', () => {
  it('adds when absent and removes when present, without mutating input', () => {
    const a = new Set([1, 2]);
    const b = toggleIndex(a, 3);
    expect([...b].sort()).toEqual([1, 2, 3]);
    expect([...a].sort()).toEqual([1, 2]); // input untouched
    const c = toggleIndex(b, 2);
    expect([...c].sort()).toEqual([1, 3]);
  });
});

describe('burstIndexSet', () => {
  // Two bursts: indices 0-2 and 3-4.
  const grouping: BurstGrouping = {
    bursts: [
      { id: 0, start: 0, end: 2, size: 3, deploymentId: 'd', startTs: '', endTs: '' },
      { id: 1, start: 3, end: 4, size: 2, deploymentId: 'd', startTs: '', endTs: '' },
    ],
    burstOf: [0, 0, 0, 1, 1],
  };

  it('returns every index in the burst containing the given index', () => {
    expect([...burstIndexSet(grouping, 1)]).toEqual([0, 1, 2]);
    expect([...burstIndexSet(grouping, 3)]).toEqual([3, 4]);
  });

  it('returns an empty set for an out-of-range index', () => {
    expect(burstIndexSet(grouping, 99).size).toBe(0);
  });
});

describe('isRangeFullySelected', () => {
  it('is true only when every index in the range is present', () => {
    expect(isRangeFullySelected(0, 2, new Set([0, 1, 2]))).toBe(true);
    expect(isRangeFullySelected(0, 2, new Set([0, 2]))).toBe(false);
    expect(isRangeFullySelected(0, 2, new Set([0, 1, 2, 7]))).toBe(true);
    expect(isRangeFullySelected(0, 2, new Set())).toBe(false);
  });
});
