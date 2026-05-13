# SPARC'd PWA — Multi-Volunteer Sync Problem

## The setup

The PWA plan (`architecture-pwa.md`) puts everything in the browser:
- **SQLite-wasm** in OPFS holds all project data (deployments, media rows, observations, taxa…).
- **Optional S3-compatible bucket** (R2, AWS, Backblaze, Minio, etc.) mirrors *media files only*.
- No backend, no accounts, static-site deploy.

## The problem

This is **single-user by construction.** Two volunteers tagging the same project end up with two unrelated SQLite databases on two laptops. There is no merge path short of CSV export/import.

We can't fix it by putting the SQLite file in the bucket — SQLite needs single-writer file locking, and object stores don't provide that.

## Hard constraints

This is open-source and global. Any solution has to grade across:

- **Tier 0** — Volunteer has nothing but a browser. Works offline forever, no sync.
- **Tier 1** — Project has *one* S3-compatible bucket. Nothing else. No funding for workers/servers. **This is the realistic case for most projects.**
- **Tier 2+** — Project has a bucket + something (Worker, VPS, Durable Object). Nice-to-have, can't be required.

So the multi-user mechanism has to work with **just a bucket**.

## Sketch of a fix (to discuss)

Treat the bucket as an append-only event log. Each volunteer writes to their own prefix; everyone reads everyone's:

```
bucket/
  media/<sha>.jpg                       (immutable, content-addressed)
  events/<volunteerId>/<ts>-<uuid>.bin  (each volunteer's change batches)
  snapshots/<watermark>.cdb             (periodic compaction)
```

- Local SQLite stays the source of truth per device; CRDT change records (via [cr-sqlite](https://github.com/vlcn-io/cr-sqlite)) get pushed to `events/<me>/...` and pulled from everyone else's prefix.
- No write collisions — different prefixes per volunteer.
- Offline-first naturally: queue events locally, flush when reconnected.
- Tier 0 still works (just no events to push).
- A future Worker / Durable Object can later replace polling with WebSocket fanout *without changing the data model*.

## Things to figure out together

1. Is cr-sqlite mature enough to bet on, or do we hand-roll a change-log table?
2. Schema cost: CRDTs require UUID PKs, soft-deletes with tombstones, no `AUTOINCREMENT`. Already mostly planned, but worth confirming.
3. Compaction policy — who triggers it, how often, what happens on races (`PUT-If-None-Match` should handle it).
4. Credential sharing: project owner gives each volunteer a bucket-scoped key. Acceptable, or do we need a smarter story?
5. Sync cadence and UX — polling every 15–30s is fine for tagging workflows; do we surface a "last synced" indicator?
6. What about Tier 0 collaboration? Camtrap-DP export/import as the manual fallback?
