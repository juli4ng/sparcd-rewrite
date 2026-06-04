// The tagger's single point of contact with `@sparcd/s3-safe`. Static BYO-S3:
// bucket access is discovered at runtime from the connected credentials, never
// baked into the bundle. IAM/CORS + the wrapper's reviewed methods are the real
// safety boundary. Collection discovery deliberately mirrors the uploader
// (`apps/sparcd-uploader/src/lib/s3.ts`) so the two tools never diverge on what
// a collection is or how it is keyed.

import { SafeS3Client, BucketNotAllowedError } from '@sparcd/s3-safe';
import type { S3Config } from '@sparcd/types';

// Not a security boundary in a static app — the wrapper just requires an
// explicit scope. The connected key's IAM policy and bucket CORS gate access.
const RUNTIME_BUCKET_SCOPE = ['*'];

let cached: { config: S3Config; client: SafeS3Client } | null = null;

export function clearClientCache(): void {
  cached = null;
}

export function getClient(cfg: S3Config): SafeS3Client {
  if (cached?.config === cfg) return cached.client;
  // Read scope only: the tagger does not write to S3 until P4.
  const client = new SafeS3Client(cfg, RUNTIME_BUCKET_SCOPE);
  cached = { config: cfg, client };
  return client;
}

// --- Collections (same model as the uploader) ------------------------------

const COLLECTION_BUCKET_PREFIX = 'sparcd-';

export type CollectionRef = {
  key: string; // `${bucket}::${uuid}`
  bucket: string;
  uuid: string;
  name: string | null;
  organization: string | null;
};

/** Discover collections by reading the deterministic `collection.json` marker
 *  in each `sparcd-<uuid>` bucket. Never lists the `Collections/` prefix. */
export async function listCollections(cfg: S3Config): Promise<CollectionRef[]> {
  const client = getClient(cfg);
  const buckets = await client.listBuckets();
  const candidates = buckets.filter(
    (b) => b.startsWith(COLLECTION_BUCKET_PREFIX) && b.length > COLLECTION_BUCKET_PREFIX.length,
  );
  const found: CollectionRef[] = [];
  await Promise.all(
    candidates.map(async (bucket) => {
      const uuid = bucket.slice(COLLECTION_BUCKET_PREFIX.length).toLowerCase();
      try {
        const bytes = await client.getObject(bucket, `Collections/${uuid}/collection.json`);
        const doc = JSON.parse(new TextDecoder().decode(bytes)) as {
          nameProperty?: string;
          organizationProperty?: string;
        };
        found.push({
          key: `${bucket}::${uuid}`,
          bucket,
          uuid,
          name: doc.nameProperty?.trim() || null,
          organization: doc.organizationProperty?.trim() || null,
        });
      } catch {
        // No marker, or unreadable / CORS-blocked. Keep probing.
      }
    }),
  );
  return found.sort(
    (a, b) => (a.name ?? a.bucket).localeCompare(b.name ?? b.bucket) || a.uuid.localeCompare(b.uuid),
  );
}

export function parseCollectionKey(key: string): { bucket: string; uuid: string } {
  const [bucket, uuid] = key.split('::');
  return { bucket, uuid };
}

// --- Uploads + images within a collection ----------------------------------

export type UploadRef = {
  prefix: string; // full `Collections/<uuid>/Uploads/<stamp>/`
  stamp: string; // the `<stamp>` folder name
};

/** Upload folders for a collection, enumerated with a delimiter (no image walk). */
export async function listUploads(cfg: S3Config, bucket: string, uuid: string): Promise<UploadRef[]> {
  const client = getClient(cfg);
  const dirs = await client.listCommonPrefixes(bucket, `Collections/${uuid}/Uploads/`);
  return dirs
    .map((prefix) => ({ prefix, stamp: prefix.replace(/\/$/, '').split('/').pop() ?? prefix }))
    .sort((a, b) => b.stamp.localeCompare(a.stamp)); // newest stamp first
}

export type UploadImage = {
  key: string; // full object key
  fileName: string;
  size: number;
};

// What the sparcd-web reader treats as an "image" under an upload prefix: it
// recurses subfolders but returns only these extensions. Matching it here means
// snapshot/CSV/JSON objects never show up as taggable images.
const IMAGE_EXT = /\.(jpe?g|mp4)$/i;

/** List the taggable images under an upload prefix (sparcd-web `get_s3_images` parity). */
export async function listUploadImages(
  cfg: S3Config,
  bucket: string,
  uploadPrefix: string,
): Promise<UploadImage[]> {
  const client = getClient(cfg);
  const images: UploadImage[] = [];
  for await (const obj of client.listObjects(bucket, uploadPrefix)) {
    if (!IMAGE_EXT.test(obj.key)) continue;
    images.push({ key: obj.key, fileName: obj.key.split('/').pop() ?? obj.key, size: obj.size });
  }
  return images.sort((a, b) => a.key.localeCompare(b.key));
}

const THUMB_TTL_SEC = 60 * 60; // 1h presigned GET, plenty for a tagging session

/** A presigned GET URL an `<img>` can render directly (no canvas/CORS needs). */
export function presignImage(cfg: S3Config, bucket: string, key: string): Promise<string> {
  return getClient(cfg).presignedGet(bucket, key, THUMB_TTL_SEC);
}

// --- Canonical Camtrap bundle (the Tag workspace base) ----------------------

// The Tag workspace grounds on the same upload-level files the Java app and
// sparcd-web read. `media.csv` is the authoritative image list (col 0 = full
// object key, col 4 = capture time, col 1 = deployment); `observations.csv`
// carries any existing species rows. P1 reads these only — no writes until P4.

export type CanonicalBundle = {
  mediaCsv: string;
  observationsCsv: string;
};

async function getText(cfg: S3Config, bucket: string, key: string, what: string): Promise<string> {
  try {
    return new TextDecoder().decode(await getClient(cfg).getObject(bucket, key));
  } catch (err) {
    throw translateS3Error(err, what);
  }
}

/** Load the canonical `media.csv` + `observations.csv` for one upload. */
export async function loadCanonicalBundle(
  cfg: S3Config,
  bucket: string,
  uploadPrefix: string,
): Promise<CanonicalBundle> {
  const [mediaCsv, observationsCsv] = await Promise.all([
    getText(cfg, bucket, `${uploadPrefix}media.csv`, 'media.csv'),
    getText(cfg, bucket, `${uploadPrefix}observations.csv`, 'observations.csv'),
  ]);
  return { mediaCsv, observationsCsv };
}

// --- Error translation (reused from the uploader's CORS mapping) -----------

/** Map an S3/browser-fetch failure to an actionable message. A status-less
 *  failure is almost always a CORS preflight rejection or network error. */
export function translateS3Error(err: unknown, what: string): Error {
  if (err instanceof BucketNotAllowedError) return err;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  if (status === 404 || e.name === 'NoSuchKey') return new Error(`${what} not found.`);
  if (status === 403 || e.name === 'AccessDenied')
    return new Error(`Access denied reading ${what} — check the key's read permissions.`);
  if (status === undefined)
    return new Error(
      `Could not reach the endpoint to read ${what}. If the endpoint is correct, the ` +
        `bucket's CORS policy likely needs to allow GET/HEAD from this origin.`,
    );
  return new Error(`Failed to read ${what} (HTTP ${status}).`);
}
