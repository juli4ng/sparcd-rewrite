// The uploader contract: `buildBundle` must emit valid v016 Camtrap data that
// the shared `@sparcd/camtrap` readers parse, and an *empty* canonical
// observations base — the same golden the tagger tests rely on. This test
// reuses the shared fixtures and readers from `packages/camtrap/test`, so the
// uploader and tagger prove the same data contract against the same bytes.

import { describe, it, expect } from 'vitest';
import {
  parseDeployments,
  parseMedia,
  parseObservations,
  parseUploadMeta,
  parseCsvRows,
  serializeCsvRows,
  validateColumnCount,
  DEPLOY_COLUMN_COUNT,
  MEDIA_COLUMN_COUNT,
  MEDIA_COL,
} from '@sparcd/camtrap';
import { fixture } from '../../../packages/camtrap/test/fixtures';
import { buildBundle, type BuildInput } from '../src/lib/bundle';
import type { Location } from '../src/lib/locations';
import type { FileEntry } from '../src/store';

const UUID = '8dbd9c43-5c3d-411d-8778-617d4693c69b';

const SAN15: Location = {
  key: `SAN15|31.5,-110.2`,
  id: 'SAN15',
  name: 'San Pedro 15',
  latitude: 31.5,
  longitude: -110.2,
  elevation: 1200,
};

// A ready FileEntry backed by a real File so `crypto.subtle` has bytes to hash.
function ready(relPath: string, exifTimestamp?: string): FileEntry {
  const bytes = new TextEncoder().encode(`fake-jpeg:${relPath}`);
  const file = new File([bytes], relPath.split('/').pop()!, { type: 'image/jpeg' });
  return {
    id: relPath,
    file,
    relPath,
    fileName: file.name,
    size: bytes.length,
    processState: 'ready',
    sha256: `sha-${relPath}`,
    exifTimestamp,
  };
}

function build(files: FileEntry[]): ReturnType<typeof buildBundle> {
  const input: BuildInput = {
    location: SAN15,
    collectionUuid: UUID,
    bucket: `sparcd-${UUID}`,
    uploaderSlug: 'jdoe',
    description: 'Educational Test — uploader bundle',
    files,
    now: new Date(2024, 0, 15, 10, 0, 0),
  };
  return buildBundle(input);
}

describe('uploader bundle is valid v016 Camtrap data', () => {
  it('writes an empty observations.csv base — the tagger golden', async () => {
    const b = await build([ready('a/IMG001.JPG', '2024-01-10T08:00:00')]);
    expect(b.observationsCsv).toBe('');
    expect(b.observationsCsv).toBe(fixture('uploader-empty-v016', 'observations.csv'));
    expect(parseObservations(b.observationsCsv)).toEqual([]);
  });

  it('media.csv leaves capture timestamps blank for the tagger to fill', async () => {
    // EXIF is captured on the FileEntry, but the canonical writer leaves col 4
    // empty on initial upload — the tagger owns per-image capture time.
    const b = await build([ready('a/IMG001.JPG', '2024-01-10T08:00:00')]);
    for (const m of parseMedia(b.mediaCsv)) expect(m.timestamp).toBe('');
  });

  it('media rows carry the full object key as media_id and round-trip', async () => {
    const b = await build([ready('a/IMG001.JPG'), ready('b/IMG002.JPG')]);
    const media = parseMedia(b.mediaCsv);
    expect(media).toHaveLength(2);
    for (const m of media) {
      expect(m.mediaId).toBe(m.mediaPath);
      expect(m.mediaPath.startsWith(`${b.uploadPath}/`)).toBe(true);
      expect(m.mimeType).toBe('image/jpeg');
    }
    expect(serializeCsvRows(parseCsvRows(b.mediaCsv))).toBe(b.mediaCsv);
    expect(validateColumnCount(parseCsvRows(b.mediaCsv), MEDIA_COLUMN_COUNT)).toBeNull();
  });

  it('deployments.csv reads back the chosen location and round-trips', async () => {
    const b = await build([ready('a/IMG001.JPG')]);
    const [d] = parseDeployments(b.deploymentsCsv);
    expect(d.locationId).toBe('SAN15');
    expect(d.locationName).toBe('San Pedro 15');
    expect(d.longitude).toBeCloseTo(-110.2, 5);
    expect(d.latitude).toBeCloseTo(31.5, 5);
    expect(d.elevation).toBeCloseTo(1200, 5);
    expect(d.deploymentId).toBe(`${UUID}:SAN15`);
    expect(serializeCsvRows(parseCsvRows(b.deploymentsCsv))).toBe(b.deploymentsCsv);
    expect(validateColumnCount(parseCsvRows(b.deploymentsCsv), DEPLOY_COLUMN_COUNT)).toBeNull();
  });

  it('UploadMeta.json starts at zero species and no edits', async () => {
    const b = await build([ready('a/IMG001.JPG'), ready('b/IMG002.JPG')]);
    const meta = parseUploadMeta(b.uploadMetaJson);
    expect(meta.imagesWithSpecies).toBe(0);
    expect(meta.imageCount).toBe(2);
    expect(meta.editComments).toEqual([]);
    expect(meta.bucket).toBe(`sparcd-${UUID}`);
  });
});

describe('bundle only includes processed files', () => {
  it('excludes queued/errored files and those without a hash', async () => {
    const files: FileEntry[] = [
      ready('a/IMG001.JPG'),
      { ...ready('b/IMG002.JPG'), processState: 'queued', sha256: undefined },
      { ...ready('c/IMG003.JPG'), processState: 'error', processError: 'boom' },
    ];
    const b = await build(files);
    expect(b.fileCount).toBe(1);
    expect(b.items).toHaveLength(1);
    expect(parseMedia(b.mediaCsv)).toHaveLength(1);
    expect(parseMedia(b.mediaCsv)[0].fileName).toBe('IMG001.JPG');
  });
});

describe('bundle integrity hash', () => {
  it('is a stable 64-hex digest for identical input', async () => {
    const a = await build([ready('a/IMG001.JPG'), ready('b/IMG002.JPG')]);
    const c = await build([ready('a/IMG001.JPG'), ready('b/IMG002.JPG')]);
    expect(a.metadataBundleSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.metadataBundleSha256).toBe(c.metadataBundleSha256);
  });

  it('every media row is reachable by its full key (reader listing parity)', async () => {
    const b = await build([ready('nested/deep/IMG009.JPG')]);
    const rows = parseCsvRows(b.mediaCsv);
    const keys = new Set(b.items.map((i) => i.key));
    for (const r of rows) expect(keys.has(r[MEDIA_COL.mediaId])).toBe(true);
  });
});
