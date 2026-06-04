// Per-species keybindings. Two sources, override-wins:
//   1. `species.json` `keyBinding` — a Java KeyCode string the SPARC'd desktop
//      app persists (e.g. "D", "DIGIT1"). Data-compatible, so a species the
//      researcher already bound in the Java app is pre-bound here.
//   2. A local override the user assigns in this tool — persisted to
//      localStorage, keyed by `scientificName`, and winning over (1).
//
// The plan is explicit: stable, user-assignable, persistent per-species keys —
// NOT rotating numeric keys. Matching is done on the normalized single
// `KeyboardEvent.key` character so the global handler stays a cheap lookup.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Normalize a Java KeyCode string (or a raw char) to the lowercase
 *  `KeyboardEvent.key` it should match. Returns null when unbindable. */
export function normalizeJavaKeyCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c.length === 1) return c.toLowerCase(); // already a char ("D", "1")
  const digit = /^(?:DIGIT|NUMPAD)([0-9])$/.exec(c);
  if (digit) return digit[1];
  // "A".."Z" arrive as length-1 above; spelled-out names are rare — ignore them.
  return null;
}

type KeyBindingState = {
  /** scientificName → normalized key char. Local overrides only. */
  overrides: Record<string, string>;
  assignKey: (scientificName: string, key: string) => void;
  clearKey: (scientificName: string) => void;
};

/** Local, persistent per-species key overrides. */
export const useKeyBindings = create<KeyBindingState>()(
  persist(
    (set) => ({
      overrides: {},
      assignKey: (scientificName, key) =>
        set((s) => {
          const next = { ...s.overrides };
          // A key is unique across species: steal it from whoever held it.
          for (const [sci, k] of Object.entries(next)) if (k === key) delete next[sci];
          next[scientificName] = key;
          return { overrides: next };
        }),
      clearKey: (scientificName) =>
        set((s) => {
          if (!(scientificName in s.overrides)) return s;
          const next = { ...s.overrides };
          delete next[scientificName];
          return { overrides: next };
        }),
    }),
    { name: 'sparcd-tagger-keybindings' },
  ),
);

/** Resolve the effective key for a species: local override, else species.json. */
export function effectiveKey(
  scientificName: string,
  jsonKeyBinding: string | null,
  overrides: Record<string, string>,
): string | null {
  return overrides[scientificName] ?? normalizeJavaKeyCode(jsonKeyBinding);
}
