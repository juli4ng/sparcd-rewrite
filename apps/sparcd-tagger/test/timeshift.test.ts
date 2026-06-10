import { describe, it, expect } from 'vitest';
import {
  ZERO_OFFSET_RECORD,
  offsetActive,
  formatOffsetDelta,
  normalizeTimestampInput,
} from '../src/lib/timeshift';

describe('offsetActive', () => {
  it('is false for null and the zero offset', () => {
    expect(offsetActive(null)).toBe(false);
    expect(offsetActive(undefined)).toBe(false);
    expect(offsetActive(ZERO_OFFSET_RECORD)).toBe(false);
  });

  it('is true when any field is non-zero, including a negative one', () => {
    expect(offsetActive({ ...ZERO_OFFSET_RECORD, hours: 1 })).toBe(true);
    expect(offsetActive({ ...ZERO_OFFSET_RECORD, minutes: -30 })).toBe(true);
    expect(offsetActive({ ...ZERO_OFFSET_RECORD, seconds: 1 })).toBe(true);
  });
});

describe('formatOffsetDelta', () => {
  it('renders a single signed unit', () => {
    expect(formatOffsetDelta({ ...ZERO_OFFSET_RECORD, hours: 1 })).toBe('+1h');
    expect(formatOffsetDelta({ ...ZERO_OFFSET_RECORD, hours: -2 })).toBe('-2h');
  });

  it('joins multiple units in y→s order, keeping signs per field', () => {
    expect(
      formatOffsetDelta({ years: 0, months: 0, days: -1, hours: 7, minutes: -30, seconds: 0 }),
    ).toBe('-1d +7h -30m');
  });

  it('says "no shift" for null/zero', () => {
    expect(formatOffsetDelta(null)).toBe('no shift');
    expect(formatOffsetDelta(ZERO_OFFSET_RECORD)).toBe('no shift');
  });
});

describe('normalizeTimestampInput', () => {
  it('accepts a space or T separator and fills missing seconds', () => {
    expect(normalizeTimestampInput('2024-01-11 06:42')).toBe('2024-01-11T06:42:00');
    expect(normalizeTimestampInput('2024-01-11T06:42:18')).toBe('2024-01-11T06:42:18');
    expect(normalizeTimestampInput('  2024-01-11 06:42:18  ')).toBe('2024-01-11T06:42:18');
  });

  it('rejects malformed or out-of-range input', () => {
    expect(normalizeTimestampInput('not a date')).toBeNull();
    expect(normalizeTimestampInput('2024-13-01 06:00:00')).toBeNull(); // month 13
    expect(normalizeTimestampInput('2024-01-11 25:00:00')).toBeNull(); // hour 25
    expect(normalizeTimestampInput('2024-01-11')).toBeNull(); // no time
  });
});
