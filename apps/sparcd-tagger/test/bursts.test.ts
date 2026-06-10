import { describe, it, expect } from 'vitest';
import { groupBursts } from '../src/lib/bursts';
import type { TagImage } from '../src/lib/workspace';

function img(key: string, deploymentId: string, ts: string): TagImage {
  return {
    key,
    fileName: key,
    deploymentId,
    baseTimestamp: ts,
    baseLabel: '',
    baseCommonName: '',
    baseCount: 0,
    baseRequested: '',
  };
}

describe('groupBursts', () => {
  it('groups images within the window on one deployment', () => {
    const { bursts, burstOf } = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-a', '2024-01-01T08:00:30'),
        img('c', 'loc-a', '2024-01-01T08:00:50'),
      ],
      60,
    );
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ start: 0, end: 2, size: 3 });
    expect(burstOf).toEqual([0, 0, 0]);
  });

  it('breaks a burst when the gap exceeds the threshold', () => {
    const { bursts, burstOf } = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-a', '2024-01-01T08:00:30'),
        img('c', 'loc-a', '2024-01-01T08:05:00'), // 4.5 min gap
      ],
      60,
    );
    expect(bursts).toHaveLength(2);
    expect(burstOf).toEqual([0, 0, 1]);
    expect(bursts[1]).toMatchObject({ start: 2, end: 2, size: 1 });
  });

  it('breaks a burst when the deployment changes even within the window', () => {
    const { bursts, burstOf } = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-b', '2024-01-01T08:00:10'),
      ],
      60,
    );
    expect(bursts).toHaveLength(2);
    expect(burstOf).toEqual([0, 1]);
  });

  it('treats a missing timestamp as a break', () => {
    const { bursts } = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-a', ''),
        img('c', 'loc-a', '2024-01-01T08:00:10'),
      ],
      60,
    );
    expect(bursts).toHaveLength(3);
  });

  it('respects a tighter threshold', () => {
    const tight = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-a', '2024-01-01T08:00:20'),
      ],
      10,
    );
    expect(tight.bursts).toHaveLength(2);
  });

  it('returns one empty grouping for no images', () => {
    expect(groupBursts([], 60)).toEqual({ bursts: [], burstOf: [], banded: true });
  });

  it('uses the tsOf accessor for band spans and gap math (corrected times)', () => {
    const images = [
      img('a', 'loc-a', '2024-01-01T08:00:00'),
      img('b', 'loc-a', '2024-01-01T08:00:30'),
    ];
    // A per-image correction pushes 'b' well outside the 60s window, so the
    // accessor-driven gap splits a burst the base timestamps would have joined.
    const corrected: Record<string, string> = {
      a: '2024-01-01T08:00:00',
      b: '2024-01-01T09:00:30',
    };
    const { bursts, burstOf } = groupBursts(images, 60, true, (i) => corrected[i.key]);
    expect(bursts).toHaveLength(2);
    expect(burstOf).toEqual([0, 1]);
    // Band labels reflect the corrected times, not the base.
    expect(bursts[1].startTs).toBe('2024-01-01T09:00:30');
  });

  it('collapses everything into one unbanded group when disabled', () => {
    const { bursts, burstOf, banded } = groupBursts(
      [
        img('a', 'loc-a', '2024-01-01T08:00:00'),
        img('b', 'loc-b', '2024-01-01T09:00:00'), // different deployment + far apart
        img('c', 'loc-a', ''), // missing timestamp
      ],
      60,
      false,
    );
    expect(banded).toBe(false);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ start: 0, end: 2, size: 3 });
    expect(burstOf).toEqual([0, 0, 0]);
  });
});
