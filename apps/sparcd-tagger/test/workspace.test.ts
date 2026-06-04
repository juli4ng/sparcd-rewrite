// The canonical media↔observations join the Tag workspace grounds on. Pure;
// the data-contract details (column positions, marker grammar) are proven in
// `@sparcd/camtrap` — this only checks the join + the seeded base state.

import { describe, it, expect } from 'vitest';
import { serializeCsvRows, serializeObservations, MEDIA_COLUMN_COUNT } from '@sparcd/camtrap';
import { buildTagImages } from '../src/lib/workspace';

// Real canonical media (Java / sparcd-web) carries the capture time in col 4,
// unlike the uploader's initial empty-timestamp write — build raw rows so the
// seeding test reflects what the workspace actually grounds on.
function mediaRow(key: string, deployment: string, timestamp: string, fileName: string): string[] {
  const row = new Array<string>(MEDIA_COLUMN_COUNT).fill('');
  row[0] = key; // media_id (= full key)
  row[1] = deployment;
  row[4] = timestamp;
  row[6] = fileName;
  row[7] = 'image/jpeg';
  return row;
}

const mediaCsv = serializeCsvRows([
  mediaRow('Collections/c/Uploads/u/IMG001.JPG', 'c:loc-a', '2024-01-01T08:00:00', 'IMG001.JPG'),
  mediaRow('Collections/c/Uploads/u/IMG002.JPG', 'c:loc-a', '2024-01-01T08:01:00', 'IMG002.JPG'),
]);

// IMG001 already tagged Coyote with a common-name marker; IMG002 untagged.
const obsCsv = serializeObservations([
  {
    observationId: 'o1',
    mediaId: 'Collections/c/Uploads/u/IMG001.JPG',
    deploymentId: 'c:loc-a',
    timestamp: '2024-01-01T08:00:00',
    scientificName: 'Canis latrans',
    count: 2,
    tags: '[COMMONNAME:Coyote]',
  },
]);

describe('buildTagImages', () => {
  const images = buildTagImages({ mediaCsv, observationsCsv: obsCsv });

  it('lists every media row in media order', () => {
    expect(images.map((i) => i.fileName)).toEqual(['IMG001.JPG', 'IMG002.JPG']);
  });

  it('seeds base label, common name, and count from existing observations', () => {
    expect(images[0]).toMatchObject({
      baseLabel: 'Canis latrans',
      baseCommonName: 'Coyote',
      baseCount: 2,
      deploymentId: 'c:loc-a',
      baseTimestamp: '2024-01-01T08:00:00',
    });
  });

  it('leaves untagged media with an empty base label', () => {
    expect(images[1].baseLabel).toBe('');
    expect(images[1].baseCount).toBe(0);
  });
});
