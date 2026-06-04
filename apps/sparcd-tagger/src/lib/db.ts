// IndexedDB-backed local draft state. Dexie owns the schema. P1 is local-only:
// nothing here ever writes to S3. Drafts persist every tag edit so a closed tab
// recovers exactly where the tagger left off, and P4 sync reads these rows.
//
// Schema versioning rule (shared with the uploader): Dexie's versioning API with
// forward-carrying upgrade callbacks, no ad-hoc store mutations. v1 is the
// initial schema. The `base*ETag` / `base*Hash` / `auditSnapshotKey` fields are
// the P4 grounding/sync surface; P1 leaves them undefined and only writes the
// edit fields. They live in the v1 shape now so P4 adds no schema bump.

import Dexie, { type Table } from 'dexie';

/** One image's local edit. `id` = `${bucket}::${uploadPrefix}::${mediaPath}`.
 *  `label` is the applied species `scientificName` **or** a non-animal label
 *  (e.g. `Casper` for Ghost); `''` means detagged / no species. A SPARC'd
 *  observation is species + count only — there is no behaviour field. */
export interface DraftRecord {
  id: string;
  bucket: string;
  uploadPrefix: string;
  mediaPath: string; // full object key = media.csv col 0
  deploymentId: string; // carried from canonical media for the eventual obs row

  // Applied tag (single label per image in v1 — multi-species is a later phase).
  label: string;
  commonName: string; // → [COMMONNAME:…] at sync; '' when label is unset/non-species
  count: number;
  requestedSpecies: string; // free-text species request → [REQUESTED_SPECIES:…]
  freeTags: string; // extra raw markers, preserved verbatim
  questionable: boolean;
  timeOverride: string | null; // per-image corrected ISO timestamp; null when unset

  lastEdited: string; // ISO
  dirty: boolean; // true once edited locally; cleared on a future successful sync

  // P4 grounding (undefined until sync grounds the draft on canonical files).
  baseMediaETag?: string;
  baseMediaHash?: string;
  baseObservationsETag?: string;
  baseObservationsHash?: string;
  baseUploadMetaETag?: string;
  baseUploadMetaHash?: string;
  auditSnapshotKey?: string;
}

/** One upload's session-level state (time offset + the canonical base it grounds on). */
export interface UploadRecord {
  id: string; // `${bucket}::${uploadPrefix}`
  bucket: string;
  uploadPrefix: string;
  loadedAt: string; // ISO
  timeOffset: TimeOffsetRecord | null; // signed Δ applied to every image; null when unset

  // P4 grounding, undefined until sync.
  mediaETag?: string;
  mediaHash?: string;
  observationsETag?: string;
  observationsHash?: string;
  uploadMetaETag?: string;
  uploadMetaHash?: string;
}

/** Signed Δ y/mo/d/h/m/s — mirrors `@sparcd/camtrap` `TimeOffset`. */
export type TimeOffsetRecord = {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export interface SessionRecord {
  sessionId: string;
  userId: string;
  startedAt: string;
  finishedAt?: string;
  syncedAt?: string;
  syncedKey?: string;
  syncedCsvHash?: string;
}

class TaggerDb extends Dexie {
  drafts!: Table<DraftRecord, string>;
  uploads!: Table<UploadRecord, string>;
  sessions!: Table<SessionRecord, string>;

  constructor() {
    super('sparcd-tagger');
    this.version(1).stores({
      // Index by upload so loading a workspace is cheap. `dirty` is a boolean —
      // not a valid IndexedDB key — so the recovery scan filters in JS instead.
      drafts: 'id, [bucket+uploadPrefix]',
      uploads: 'id',
      sessions: 'sessionId, syncedAt',
    });
  }
}

export const db = new TaggerDb();

export const draftId = (bucket: string, uploadPrefix: string, mediaPath: string): string =>
  `${bucket}::${uploadPrefix}::${mediaPath}`;

export const uploadId = (bucket: string, uploadPrefix: string): string =>
  `${bucket}::${uploadPrefix}`;

/** All drafts for one upload, by media path. Drives workspace hydration. */
export async function loadDraftsForUpload(
  bucket: string,
  uploadPrefix: string,
): Promise<DraftRecord[]> {
  return db.drafts.where('[bucket+uploadPrefix]').equals([bucket, uploadPrefix]).toArray();
}

/** Drafts still flagged `dirty` — surfaced on next open as unsaved recovery. */
export async function listDirtyDrafts(): Promise<DraftRecord[]> {
  return db.drafts.filter((d) => d.dirty).toArray();
}

export async function putDraft(record: DraftRecord): Promise<void> {
  await db.drafts.put(record);
}

/** Drop every local draft for one upload (the per-upload "Discard local changes"). */
export async function discardUploadDrafts(bucket: string, uploadPrefix: string): Promise<void> {
  await db.drafts.where('[bucket+uploadPrefix]').equals([bucket, uploadPrefix]).delete();
}
