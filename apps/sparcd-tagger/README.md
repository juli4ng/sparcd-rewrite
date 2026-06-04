# sparcd-tagger

A static, browser-based tagging interface for SPARC'd camera-trap images. It
reads the same MinIO/R2/S3 buckets the other SPARC'd readers use and (from P4)
writes back the canonical Camtrap-DP metadata the Java app, `sparcd-web`, and
the marimo explorer already read. See [`plan.md`](./plan.md) for the full design
and phase breakdown.

## Status

**P0 complete** — data contract + app scaffold. Local-only, read-only.

- The v016 data contract lives in `@sparcd/camtrap` (readers, tagger merge,
  UploadMeta delta, time-shift, tag-marker grammar) and is proven by the shared
  Vitest harness in `packages/camtrap/test` against golden fixtures.
- The app connects (shared `@sparcd/auth-ui`), discovers collections and uploads
  the same way the uploader does, and renders an upload's images from presigned
  GET URLs. Species vocabulary loads from `Settings/species.json`.

P1–P3 add tagging, drafts, bursts, and batch selection (still local-only); P4
introduces the reviewed S3 write path.

## Develop

```sh
pnpm install
pnpm --filter sparcd-tagger dev      # Vite dev server
pnpm --filter sparcd-tagger build    # tsc --noEmit && vite build
pnpm test                            # shared @sparcd/camtrap contract suite
```

Dev prefill: set `VITE_SPARCD_S3_ENDPOINT` in `apps/sparcd-tagger/.env`
(gitignored) to prefill the endpoint field. Credentials are never prefilled and
are entered at runtime — this is a BYO-S3 static app (see the security contract
in `plan.md`).
