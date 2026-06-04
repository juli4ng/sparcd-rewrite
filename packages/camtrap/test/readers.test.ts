import { describe, it, expect } from 'vitest';
import { parseDeployments, parseMedia, parseObservations } from '../src/index';
import { fixture } from './fixtures';

describe('typed readers map fixed v016 columns', () => {
  for (const set of ['java-v016', 'sparcd-web-v016'] as const) {
    it(`${set}: deployments`, () => {
      const [d] = parseDeployments(fixture(set, 'deployments.csv'));
      expect(d.locationId).toBe('SAN15');
      expect(d.locationName).toBe('San Pedro 15');
      // longitude precedes latitude in the v016 layout.
      expect(d.longitude).toBeCloseTo(-110.2, 5);
      expect(d.latitude).toBeCloseTo(31.5, 5);
      expect(d.elevation).toBeCloseTo(1200, 5);
    });

    it(`${set}: media full key + timestamp`, () => {
      const media = parseMedia(fixture(set, 'media.csv'));
      expect(media).toHaveLength(5);
      expect(media[0].mediaPath).toMatch(/\/IMG001\.JPG$/);
      expect(media[0].mediaId).toBe(media[0].mediaPath);
      expect(media[0].fileName).toBe('IMG001.JPG');
      expect(media[0].timestamp).toBe('2024-01-10T08:00:00');
      expect(media[0].mimeType).toBe('image/jpeg');
    });

    it(`${set}: observations species/count/media-id`, () => {
      const obs = parseObservations(fixture(set, 'observations.csv'));
      const deer = obs.find((o) => o.scientificName === 'Odocoileus hemionus')!;
      expect(deer.count).toBe(2);
      expect(deer.mediaId).toMatch(/\/IMG001\.JPG$/);
      expect(deer.tags).toBe('[COMMONNAME:Mule Deer]');
    });
  }
});
