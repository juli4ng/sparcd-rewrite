// The app's single point of contact with `@sparcd/s3-safe`. This is a static
// BYO-S3 app: bucket access is discovered at runtime from the connected
// credentials, not baked into the JS bundle. IAM/CORS and the wrapper's
// append-only methods are the real safety boundaries.

import { SafeS3Client, BucketNotAllowedError } from '@sparcd/s3-safe';
import type { S3Config } from '@sparcd/types';
import { LOCATIONS_KEY, parseLocations, type LocationsParse } from './locations';

// Client-side bucket allowlists are not a security boundary in a static app.
// They exist only because the wrapper requires an explicit scope; the connected
// user's IAM policy and bucket CORS decide what the app can actually touch.
const RUNTIME_BUCKET_SCOPE = ['*'];

// Cache the client for the active connection object only. This preserves the
// UX benefit of SDK client reuse while avoiding stale credential reuse after a
// reconnect, and it does not put raw secrets into cache keys.
let cached: { config: S3Config; client: SafeS3Client } | null = null;

export function clearClientCache(): void {
  cached = null;
}

export function getClient(cfg: S3Config): SafeS3Client {
  if (cached?.config === cfg) return cached.client;
  const client = new SafeS3Client(cfg, RUNTIME_BUCKET_SCOPE, RUNTIME_BUCKET_SCOPE);
  cached = { config: cfg, client };
  return client;
}

/**
 * Discover buckets that contain `Settings/locations.json`. Name preferences
 * keep official SPARC'd buckets first, but any readable bucket with the marker
 * works for BYO-S3 deployments.
 */
export async function discoverSettingsBuckets(client: SafeS3Client): Promise<string[]> {
  const buckets = await client.listBuckets();
  const found: string[] = [];
  await Promise.all(
    buckets.map(async (bucket) => {
      try {
        await client.statObject(bucket, LOCATIONS_KEY);
        found.push(bucket);
      } catch {
        // Not a settings bucket, not readable, or blocked by CORS. Keep probing.
      }
    }),
  );
  return found.sort((a, b) => settingsRank(a) - settingsRank(b) || a.localeCompare(b));
}

function settingsRank(bucket: string): number {
  if (bucket.startsWith('sparcd-settings-')) return 0;
  if (bucket === 'sparcd') return 1;
  return 2;
}

export async function discoverSettingsBucket(client: SafeS3Client): Promise<string> {
  const buckets = await discoverSettingsBuckets(client);
  if (buckets[0]) return buckets[0];
  throw new Error(
    `No readable settings bucket found. The connected credentials must be able to HEAD/GET "${LOCATIONS_KEY}" in one visible bucket, and that bucket must allow this web origin via CORS.`,
  );
}

export type LocationsResult = LocationsParse & { settingsBucket: string };

/**
 * Read + parse the location registry. Network/CORS failures surface as a
 * `Failed to fetch`-style error with no HTTP status, so we translate the
 * common cases into actionable messages — this is the "validate browser CORS
 * read behavior" surface for P2.
 */
export async function fetchLocations(cfg: S3Config): Promise<LocationsResult> {
  const client = getClient(cfg);
  const settingsBucket = await discoverSettingsBucket(client);
  let bytes: Uint8Array;
  try {
    bytes = await client.getObject(settingsBucket, LOCATIONS_KEY);
  } catch (err) {
    throw translateReadError(err, settingsBucket);
  }
  const text = new TextDecoder().decode(bytes);
  const parsed = parseLocations(text);
  return { ...parsed, settingsBucket };
}

export type CollectionRef = {
  key: string;
  bucket: string;
  uuid: string;
  name: string | null;
  organization: string | null;
};

// A collection *is* a bucket named `sparcd-<uuid>`, and its marker lives at the
// deterministic key `Collections/<uuid>/collection.json` (uuid = bucket name
// minus this prefix). This mirrors the upstream SPARC'd `get_user_collections`.
const COLLECTION_BUCKET_PREFIX = 'sparcd-';

/**
 * Discover collections by reading the deterministic marker in each
 * `sparcd-<uuid>` bucket. We never list the `Collections/` prefix — that walks
 * every upload image and paginates into thousands of requests across all
 * buckets. One small GET per candidate bucket also gives us the human-readable
 * name for the picker, so no second round-trip is needed.
 */
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
        // No collection marker, or the bucket is unreadable / CORS-blocked.
      }
    }),
  );
  // Sort by display name so the picker reads alphabetically; fall back to bucket.
  return found.sort(
    (a, b) => (a.name ?? a.bucket).localeCompare(b.name ?? b.bucket) || a.uuid.localeCompare(b.uuid),
  );
}

// Split one CSV line into fields. The live `deployments.csv` files are wildly
// inconsistent — some rows are fully quoted (with `""` escaping), others are
// bare — so we parse both forms rather than assume quoting.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

// Pull the deployed location ids out of a header-less `deployments.csv`.
// location_id is column 1, but it's sometimes stored as the full
// `<collection-uuid>:<location-id>` form, so we keep only the trailing id. The
// `0000` "cleared coordinates" sentinel is dropped, matching the explorer.
function deploymentLocationIds(csv: string): string[] {
  const ids: string[] = [];
  for (const line of csv.split('\n')) {
    if (!line.trim()) continue;
    const raw = parseCsvLine(line)[1]?.trim();
    if (!raw) continue;
    const id = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
    if (id && id !== '0000') ids.push(id);
  }
  return ids;
}

/**
 * The location ids a collection has actually deployed, read from each upload's
 * `Collections/<uuid>/Uploads/<upload>/deployments.csv`. Upload folders are
 * enumerated with a delimiter (no image walk), then one small GET per upload.
 */
export async function listCollectionDeploymentLocationIds(
  cfg: S3Config,
  ref: CollectionRef,
): Promise<string[]> {
  const client = getClient(cfg);
  const uploadDirs = await client.listCommonPrefixes(ref.bucket, `Collections/${ref.uuid}/Uploads/`);
  const ids = new Set<string>();
  await Promise.all(
    uploadDirs.map(async (dir) => {
      try {
        const bytes = await client.getObject(ref.bucket, `${dir}deployments.csv`);
        for (const id of deploymentLocationIds(new TextDecoder().decode(bytes))) ids.add(id);
      } catch {
        // Upload without a deployments.csv yet, or unreadable / CORS-blocked.
      }
    }),
  );
  return [...ids];
}

function translateReadError(err: unknown, bucket: string): Error {
  if (err instanceof BucketNotAllowedError) return err;
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  if (status === 404 || e.name === 'NoSuchKey') {
    return new Error(`"${LOCATIONS_KEY}" not found in bucket "${bucket}".`);
  }
  if (status === 403 || e.name === 'AccessDenied') {
    return new Error(`Access denied reading "${LOCATIONS_KEY}" — check the key's read permissions.`);
  }
  // No HTTP status from a browser fetch almost always means the request never
  // completed: a CORS preflight rejection or a network/DNS/TLS failure.
  if (status === undefined) {
    return new Error(
      `Could not reach the endpoint to read "${LOCATIONS_KEY}". If the endpoint is correct, ` +
        `the bucket's CORS policy likely needs to allow GET/HEAD from this origin.`,
    );
  }
  return new Error(`Failed to read "${LOCATIONS_KEY}" (HTTP ${status}).`);
}
