# sparcd-uploader

A static, browser-based tool for preparing and uploading SPARC'd camera-trap
image batches. Sits alongside SPARC'd. See [`plan.md`](./plan.md) for the full
design and phase breakdown.

## Status

Runtime-discovered BYO-S3 uploader.

- Shared Connection gate (`@sparcd/auth-ui`) — three fields, endpoint-inferred
  region / path-style / secure behind "Advanced".
- Tool chrome with section tabs (New upload · History · Settings), upload-state
  pill, and a light/walnut-dark theme toggle.
- Four-step flow: Drop, Inspect, Assign, Upload.
- Drag-and-drop a folder (or "Choose folder"); recursive JPEG scan via the
  File System Access entries API / `webkitdirectory`.
- EXIF, SHA-256, thumbnails, and validation run in Web Workers.
- The app discovers readable settings buckets by probing for
  `Settings/locations.json`, and discovers target collections from
  `Collections/<uuid>/collection.json`.
- Dry-run is on by default. Wet uploads use the connected credentials directly;
  IAM and bucket CORS are the real access gates.

## Static BYO-S3 Contract

Fact: this app is a static SPA. It has no backend service, no server-side
session, and no trusted server-side environment variables.

Decision: users bring their own S3-compatible endpoint, credentials, settings
bucket, and collection bucket. The app discovers usable buckets at runtime from
the permissions granted to those credentials.

Security controls:

- IAM or provider policy limits which buckets, prefixes, and S3 actions the
  credentials can use.
- Bucket CORS controls whether this hosted web origin can call S3 from the
  browser.
- `@sparcd/s3-safe` is the only S3 client boundary in the app. It exposes read
  methods and immutable append-only writers. It exposes no delete, copy, or
  overwrite API.
- Conditional writes, `HEAD` verification, dry-run-by-default, and completion
  sentinels reduce accidental publish risk.

Non-controls:

- Build-time `VITE_*` bucket allowlists are not used for authorization.
- Client-side bucket discovery is not authorization. It only finds buckets the
  supplied credentials and CORS policy already expose.
- Official SPARC'd hosting follows the same model. Official credentials must be
  scoped by IAM/provider policy, not by static app configuration.

## Develop

```sh
pnpm install          # from the repo root
pnpm --filter sparcd-uploader dev
```

Optional dev prefill: copy `.env.example` to `.env` and set
`VITE_SPARCD_S3_ENDPOINT` (endpoint only — never secrets).

## Shared packages

This app established the workspace's shared packages, all consumed as
TypeScript source (no `dist/`):

- `@sparcd/types` — `S3Config`, `Collection`, `Species`, `UserSession`, and the
  pure `detectBackendDefaults` endpoint inference.
- `@sparcd/s3-safe` — the single blessed S3 boundary (runtime scope + read
  methods + immutable writers).
- `@sparcd/auth-ui` — the shared Connection screen.
- `@sparcd/camtrap` — Camtrap-DP types and CSV/metadata writers.
