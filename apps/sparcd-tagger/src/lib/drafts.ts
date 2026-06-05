// Local draft edit state. The in-memory map is the hot path the UI reads and
// writes optimistically; Dexie is the durable mirror written debounced and off
// the keystroke path (plan: "Dexie writes are debounced and off the hot path").
//
// One record per image, keyed by media path. Mutations replace the top-level
// `drafts` object but preserve unchanged record references, so a per-row
// `s.drafts[path]` selector only re-renders the row that actually changed —
// editing one image never re-renders the whole strip.

import { create } from 'zustand';
import { db, draftId, loadDraftsForUpload, discardUploadDrafts, uploadId, type DraftRecord } from './db';

/** The built-in non-animal label. Encoded as a species row (`Casper`, count ≥1)
 *  so it counts as species-present exactly like Java treats it (P0 decision). */
export const GHOST = { label: 'Casper', commonName: 'Ghost' } as const;

export type UploadCtx = { bucket: string; uploadPrefix: string };

/** The canonical base tag for an image, used only to seed a brand-new draft. */
export type BaseSeed = { label: string; commonName: string; count: number; requestedSpecies: string };

/** One image a batch operation targets: its media path + deployment, plus the
 *  optional canonical base tag. The base seeds a *freshly created* draft so a
 *  partial edit (e.g. toggling questionable on an already-tagged image) never
 *  drops the existing species — a draft is the image's full intended state. */
export type TagTarget = { mediaPath: string; deploymentId: string; base?: BaseSeed };

/** The tag a UI action applies to an image. */
export type AppliedTag = {
  label: string; // scientificName or '' to detag
  commonName: string;
  count: number;
  requestedSpecies?: string;
  freeTags?: string;
};

type DraftState = {
  loadedKey: string | null; // `${bucket}::${uploadPrefix}` currently hydrated
  loading: boolean;
  drafts: Record<string, DraftRecord>; // by mediaPath

  loadUpload: (ctx: UploadCtx) => Promise<void>;
  applyTag: (ctx: UploadCtx, mediaPath: string, deploymentId: string, tag: AppliedTag) => void;
  detag: (ctx: UploadCtx, mediaPath: string, deploymentId: string) => void;
  toggleQuestionable: (ctx: UploadCtx, mediaPath: string, deploymentId: string) => void;

  // Batch variants for whole-burst / multi-select: one state update + one Dexie
  // write per target, so applying to a 2,000-image burst is a single re-render
  // of the changed rows, not 2,000 sequential store mutations.
  applyTagMany: (ctx: UploadCtx, targets: TagTarget[], tag: AppliedTag) => void;
  detagMany: (ctx: UploadCtx, targets: TagTarget[]) => void;
  setQuestionableMany: (ctx: UploadCtx, targets: TagTarget[], value: boolean) => void;

  /** Flush every pending debounced Dexie write now (manual Cmd/Ctrl+S confirm). */
  flushSaves: () => Promise<void>;
  discardUpload: (ctx: UploadCtx) => Promise<void>;
  /** Clear `dirty` on the drafts that were just synced (they now match the new
   *  base). Drafts not in the sync — e.g. a questionable-only flag, which has no
   *  canonical target — are left dirty so they stay surfaced as unsaved. */
  markUploadSynced: (ctx: UploadCtx, mediaPaths: string[]) => Promise<void>;
};

// Per-record debounce so a burst of keystrokes coalesces into one Dexie write.
const SAVE_DEBOUNCE_MS = 200;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(record: DraftRecord): void {
  const existing = pending.get(record.id);
  if (existing) clearTimeout(existing);
  pending.set(
    record.id,
    setTimeout(() => {
      pending.delete(record.id);
      void db.drafts.put(record);
    }, SAVE_DEBOUNCE_MS),
  );
}

/** A fresh draft for an image, seeded from its canonical base tag when one is
 *  supplied so a partial edit preserves the existing species. */
export function blankDraft(
  ctx: UploadCtx,
  mediaPath: string,
  deploymentId: string,
  base?: BaseSeed,
): DraftRecord {
  return {
    id: draftId(ctx.bucket, ctx.uploadPrefix, mediaPath),
    bucket: ctx.bucket,
    uploadPrefix: ctx.uploadPrefix,
    mediaPath,
    deploymentId,
    label: base?.label ?? '',
    commonName: base?.commonName ?? '',
    count: base?.count ?? 0,
    requestedSpecies: base?.requestedSpecies ?? '',
    freeTags: '',
    questionable: false,
    timeOverride: null,
    lastEdited: '',
    dirty: false,
  };
}

export const useDraftStore = create<DraftState>((set, get) => {
  /** Apply the same patch to one or more images in a single state update,
   *  scheduling a debounced Dexie write per touched record. */
  const mutateMany = (ctx: UploadCtx, targets: TagTarget[], patch: Partial<DraftRecord>): void => {
    if (!targets.length) return;
    const now = new Date().toISOString();
    const updates: Record<string, DraftRecord> = {};
    const cur = get().drafts;
    for (const { mediaPath, deploymentId, base } of targets) {
      const prev = cur[mediaPath] ?? blankDraft(ctx, mediaPath, deploymentId, base);
      const next: DraftRecord = {
        ...prev,
        deploymentId: deploymentId || prev.deploymentId,
        ...patch,
        lastEdited: now,
        dirty: true,
      };
      updates[mediaPath] = next;
      scheduleSave(next);
    }
    set((s) => ({ drafts: { ...s.drafts, ...updates } }));
  };

  const mutate = (
    ctx: UploadCtx,
    mediaPath: string,
    deploymentId: string,
    patch: Partial<DraftRecord>,
  ): void => mutateMany(ctx, [{ mediaPath, deploymentId }], patch);

  const tagPatch = (tag: AppliedTag): Partial<DraftRecord> => ({
    label: tag.label,
    commonName: tag.commonName,
    count: tag.label ? Math.max(1, tag.count) : 0,
    requestedSpecies: tag.requestedSpecies ?? '',
    freeTags: tag.freeTags ?? '',
  });

  return {
    loadedKey: null,
    loading: false,
    drafts: {},

    loadUpload: async (ctx) => {
      const key = uploadId(ctx.bucket, ctx.uploadPrefix);
      if (get().loadedKey === key) return;
      set({ loading: true, loadedKey: key, drafts: {} });
      const rows = await loadDraftsForUpload(ctx.bucket, ctx.uploadPrefix);
      // Ignore a result that arrived after the user switched uploads.
      if (get().loadedKey !== key) return;
      const map: Record<string, DraftRecord> = {};
      for (const r of rows) map[r.mediaPath] = r;
      // The `uploads` record (loadedAt + base ETags/hashes) is owned by the
      // workspace grounding step (`groundUpload`), so the base and the on-screen
      // data are written together; the draft store no longer touches it.
      set({ loading: false, drafts: map });
    },

    applyTag: (ctx, mediaPath, deploymentId, tag) =>
      mutate(ctx, mediaPath, deploymentId, tagPatch(tag)),

    detag: (ctx, mediaPath, deploymentId) =>
      mutate(ctx, mediaPath, deploymentId, {
        label: '',
        commonName: '',
        count: 0,
        requestedSpecies: '',
      }),

    toggleQuestionable: (ctx, mediaPath, deploymentId) => {
      const prev = get().drafts[mediaPath];
      mutate(ctx, mediaPath, deploymentId, { questionable: !prev?.questionable });
    },

    applyTagMany: (ctx, targets, tag) => mutateMany(ctx, targets, tagPatch(tag)),

    detagMany: (ctx, targets) =>
      mutateMany(ctx, targets, { label: '', commonName: '', count: 0, requestedSpecies: '' }),

    setQuestionableMany: (ctx, targets, value) =>
      mutateMany(ctx, targets, { questionable: value }),

    flushSaves: async () => {
      const records: DraftRecord[] = [];
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        const rec = Object.values(get().drafts).find((d) => d.id === id);
        if (rec) records.push(rec);
      }
      pending.clear();
      if (records.length) await db.drafts.bulkPut(records);
    },

    discardUpload: async (ctx) => {
      await discardUploadDrafts(ctx.bucket, ctx.uploadPrefix);
      if (get().loadedKey === uploadId(ctx.bucket, ctx.uploadPrefix)) set({ drafts: {} });
    },

    markUploadSynced: async (ctx, mediaPaths) => {
      void ctx;
      if (!mediaPaths.length) return;
      const next = { ...get().drafts };
      const changed: DraftRecord[] = [];
      for (const path of mediaPaths) {
        const rec = next[path];
        if (!rec?.dirty) continue;
        // Drop any debounced write for this record — we rewrite it clean now.
        const timer = pending.get(rec.id);
        if (timer) {
          clearTimeout(timer);
          pending.delete(rec.id);
        }
        const clean = { ...rec, dirty: false };
        next[path] = clean;
        changed.push(clean);
      }
      if (changed.length) {
        set({ drafts: next });
        await db.drafts.bulkPut(changed);
      }
    },
  };
});

/** Count of dirty drafts in the loaded upload — drives the "N unsaved" readout. */
export function dirtyCount(drafts: Record<string, DraftRecord>): number {
  let n = 0;
  for (const id in drafts) if (drafts[id].dirty) n++;
  return n;
}
