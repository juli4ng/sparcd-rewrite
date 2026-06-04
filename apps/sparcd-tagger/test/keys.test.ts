// Java KeyCode → `KeyboardEvent.key` normalization, and override-wins
// resolution. Data-compatible with the desktop app's persisted `keyBinding`.

import { describe, it, expect } from 'vitest';
import { normalizeJavaKeyCode, effectiveKey } from '../src/lib/keys';

describe('normalizeJavaKeyCode', () => {
  it('maps single letters to a lowercase key char', () => {
    expect(normalizeJavaKeyCode('D')).toBe('d');
  });

  it('maps DIGIT/NUMPAD codes to the digit char', () => {
    expect(normalizeJavaKeyCode('DIGIT1')).toBe('1');
    expect(normalizeJavaKeyCode('NUMPAD7')).toBe('7');
  });

  it('returns null for empty / unbindable codes', () => {
    expect(normalizeJavaKeyCode(null)).toBeNull();
    expect(normalizeJavaKeyCode('')).toBeNull();
    expect(normalizeJavaKeyCode('ENTER')).toBeNull();
  });
});

describe('effectiveKey', () => {
  it('prefers a local override over the species.json binding', () => {
    expect(effectiveKey('Canis latrans', 'D', { 'Canis latrans': 'c' })).toBe('c');
  });

  it('falls back to the normalized species.json binding', () => {
    expect(effectiveKey('Canis latrans', 'D', {})).toBe('d');
  });

  it('is null when neither source binds the species', () => {
    expect(effectiveKey('Canis latrans', null, {})).toBeNull();
  });
});
