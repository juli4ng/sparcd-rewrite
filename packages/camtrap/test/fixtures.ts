// Shared fixture loader for the contract tests. The fixtures themselves are
// materialized by `_generate.mjs` (see that file for provenance) and are the
// durable golden data both sparcd-uploader and sparcd-tagger test against.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export type FixtureSet =
  | 'java-v016'
  | 'sparcd-web-v016'
  | 'uploader-empty-v016'
  | 'tagger-edited-v016';

export function fixture(set: FixtureSet, file: string): string {
  return readFileSync(join(here, 'fixtures', set, file), 'utf8');
}
