// Object-key safety rules — the alphabet, traversal rejection, and
// deterministic collision suffixes that turn local filenames into S3 keys.

import { describe, it, expect } from 'vitest';
import {
  sanitizeUploaderUser,
  sanitizeRelPath,
  shortSuffix,
  resolveCollisions,
} from '../src/lib/normalize';

describe('sanitizeUploaderUser', () => {
  it('lowercases and collapses disallowed runs to a single hyphen', () => {
    expect(sanitizeUploaderUser('Jane Doe!! (UA)')).toBe('jane-doe-ua');
  });

  it('trims leading/trailing separators', () => {
    expect(sanitizeUploaderUser('__jdoe--')).toBe('jdoe');
    expect(sanitizeUploaderUser('  --x--  ')).toBe('x');
  });

  it('keeps allowed underscores and digits', () => {
    expect(sanitizeUploaderUser('cam_trap_07')).toBe('cam_trap_07');
  });
});

describe('sanitizeRelPath', () => {
  it('keeps nested structure and strips leading slashes', () => {
    expect(sanitizeRelPath('/sub/IMG001.JPG')).toEqual({ ok: true, name: 'sub/IMG001.JPG' });
  });

  it('collapses backslashes and repeated separators to a single slash', () => {
    expect(sanitizeRelPath('a\\\\b//c.jpg')).toEqual({ ok: true, name: 'a/b/c.jpg' });
  });

  it('rejects path-traversal segments', () => {
    expect(sanitizeRelPath('../etc/passwd')).toEqual({ ok: false, reason: 'Path traversal segment' });
    expect(sanitizeRelPath('a/./b.jpg')).toEqual({ ok: false, reason: 'Path traversal segment' });
  });

  it('rejects an empty name after normalization', () => {
    expect(sanitizeRelPath('///').ok).toBe(false);
  });

  it('strips control characters', () => {
    const withCtrl = `a${String.fromCharCode(7)}b${String.fromCharCode(0x1f)}.jpg`;
    expect(sanitizeRelPath(withCtrl)).toEqual({ ok: true, name: 'ab.jpg' });
  });
});

describe('shortSuffix', () => {
  it('is deterministic and 6 hex chars', () => {
    const a = shortSuffix('sha-abc');
    expect(a).toMatch(/^[0-9a-f]{6}$/);
    expect(shortSuffix('sha-abc')).toBe(a);
  });

  it('differs for different seeds', () => {
    expect(shortSuffix('seed-1')).not.toBe(shortSuffix('seed-2'));
  });
});

describe('resolveCollisions', () => {
  it('leaves unique names untouched', () => {
    const out = resolveCollisions([
      { id: '1', name: 'a/x.jpg', seed: 's1' },
      { id: '2', name: 'a/y.jpg', seed: 's2' },
    ]);
    expect(out.get('1')).toBe('a/x.jpg');
    expect(out.get('2')).toBe('a/y.jpg');
  });

  it('suffixes colliding names before the extension, deterministically', () => {
    const items = [
      { id: '1', name: 'IMG.jpg', seed: 'sha-1' },
      { id: '2', name: 'IMG.jpg', seed: 'sha-2' },
    ];
    const out = resolveCollisions(items);
    expect(out.get('1')).toBe(`IMG-${shortSuffix('sha-1')}.jpg`);
    expect(out.get('2')).toBe(`IMG-${shortSuffix('sha-2')}.jpg`);
    expect(resolveCollisions(items)).toEqual(out); // stable across runs
  });
});
