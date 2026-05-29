# Claude Design prompt — sparcd-uploader

Paste into the **existing SPARCd Field Notebook v2 thread** in
[claude.ai/design](https://claude.ai/design) — it already has the locked
tokens, typography, and existing screens in context. This prompt asks for
**new pages**, in that same style, plus a dark variant. Expect Claude
Design to ask clarifying questions before it renders; answer them, then let
it build the screens as real HTML/CSS/JS.

---

Continuing in the **Field Notebook v2** style we've established (cream
paper, Newsreader serif + Inter Tight + JetBrains Mono for data, ink-blue
`#0b3358` accent, hairline `rule` dividers, sharp corners, 14px body floor,
32px hit targets, 2px accent focus ring, `mark` #ead8a3 active-row
highlight, WCAG AA), design a set of **new pages** for a separate tool:
**sparcd-uploader**.

This is a standalone static tool, so drop the cross-app SPARC'd tab bar
(Home/Collections/Search/Maps) — nothing should imply navigation this
single-purpose bundle can't perform. **Instead, reuse the same top-nav tab
component for the tool's own internal sections**, so it still reads as
family while giving the tool real internal navigation. Chrome: paw +
"SPARC'd · Uploader" wordmark, the tool's section tabs, and the
upload-state pill. Don't introduce a new palette or typeface — extend the
one we have, including the Home screen's mono-table treatment for file
listings.

### Internal navigation (section tabs)

- **New upload** — the four-step wizard (default landing).
- **History** — past uploads from this connection: date, collection,
  deployment, file count, status (complete / failed / incomplete). Drill
  into a detail view; resume any incomplete one.
- **Settings** — connection/credentials, default uploader identity, upload
  concurrency, dry-run default.

## The tool, the user, the job

A focused, static web tool that uploads folders of camera-trap images into
storage. A researcher just back from the field has an SD card or folder of
JPEGs (50–5,000 files, 1–25 MB each). They want to push the batch into a
collection, attach it to one camera deployment, and walk away confident
it's intact — or resume cleanly if the browser crashed mid-transfer.
Laptop only. This operation creates canonical data, so the UI should feel
careful and trustworthy — never celebratory.

## New pages and states to render

### Connection (shared across all JS tools — design it once here)

A single shared credentials screen reused by every JS tool (uploader,
tagger, future tools); the **only** per-tool difference is the chrome label
showing which tool you're connecting to ("SPARC'd · Uploader"). Design it
to be parameterized by that tool name, nothing else. Fields: endpoint,
access key, secret key, secure-HTTPS toggle, region, force-path-style
toggle, and a backend preset dropdown (MinIO / AWS S3 / Cloudflare R2) that
fills region + path-style. Plus a per-tool identity field and dry-run
default. Gates the tool on first run, editable later under Settings. Make
it obvious which tool you're in, but keep the form itself identical
everywhere.

### History + upload detail

- **History list** — virtualized table of past uploads (date, collection,
  deployment, file count, total size, status pill). Filter by status.
- **Upload detail** — drill into one: its manifest summary, file list,
  completion state, and — if incomplete — a clear "Resume" entry back into
  the wizard.

### New upload — a four-step linear flow with a clear step indicator:

1. **Drop** — empty state with a restrained drag-and-drop landing zone (no
   consumer-app illustration) + a "Choose folder" affordance; plus the
   mid-drop scanning state (EXIF + hashing progress).
2. **Inspect** — dense, virtualized file list: thumbnail, filename, EXIF
   timestamp (mono), dimensions, size (mono), validation state. Show a mix
   of valid / warning / invalid rows with inline reasons, a filter bar, and
   bulk "drop invalid" / "fix manually" actions.
3. **Assign** — deployment picker (combobox over the locations registry,
   shown open), uploader-user field, description, target collection; below
   it, an inline preview of the five generated metadata files
   (`UploadMeta.json`, `UploadComplete.json`, `deployments.csv`,
   `media.csv`, `observations.csv`).
4. **Upload** — five sub-states:
   - in-progress (aggregate + per-file pending/uploading/done/failed) while
     image blobs transfer;
   - one **failed** row with individual retry;
   - **publishing the final manifest** — a distinct sub-state after all
     blobs land, while the metadata files write and `UploadComplete.json`
     is committed last. The upload is *not yet visible* to downstream
     readers during this step; the copy and progress treatment should make
     that "staged, not yet published" status legible;
   - **completion** (calm, factual) — conveys the manifest is committed and
     the upload is now visible to downstream readers;
   - a **resume** modal on reopen (resume vs. reselect-folder).

Plus an **upload-state pill** for the top nav in all states: `ready`,
`uploading…`, `publishing…` (blobs done, manifest committing — staged, not
yet visible to readers), `complete`, `failed`, `dry-run`. Distinct by
shape + icon, not color alone. The pill and the Upload body must agree —
when the body shows the "publishing the final manifest" sub-state, the pill
reads `publishing…`, not `uploading…`.

## Dark mode

Render a **dark variant of Field Notebook** for every page above — not a
separate direction. Derive a warm, low-glare dark surface (think aged
leather / dark walnut / warm charcoal, not a cold blue-black console) so it
still reads as a field journal at night. Re-tune the token set for dark:

- A warm dark `paper`/`panel` pair, warm off-white text, hairline rules
  that hold 3:1 on the dark surface.
- Keep the accent recognizably ink-blue (lighten for AA on dark if needed);
  re-tune `warn`/`ok` and the `mark` active-row highlight for dark.
- Newsreader / Inter Tight / JetBrains Mono unchanged.
- Target WCAG AA on the dark pairs too.

Deliver the dark variant as a parallel token set plus the same pages, so
the two themes are a swap, not a redraw.

## Design requirements

- The **dry-run vs live** distinction is the single most important visual
  decision — the upload button should change shape between modes, not just
  color, and dry-run deserves a persistent top banner in both themes. Make
  it impossible to confuse the two.
- Progress is a first-class element here, not a corner pill.
- No celebratory animation on completion.
- The whole flow must be completable by keyboard alone. In at least one
  state (the Inspect list is the richest), show the **intended tab order
  and the active focus target** explicitly, so the keyboard path is
  unambiguous for implementation.

## Component inventory

Alongside the screens, output a **reusable component set** with light +
dark variants, so the build consumes parts, not just pages:

- section-tab nav (tool chrome)
- upload-state pill (all states)
- step indicator
- file row (valid / warning / invalid / uploading / done / failed)
- history row + status pill
- drag-and-drop landing zone (idle / hover / scanning)
- deployment combobox
- credentials form + backend-preset dropdown (**shared** across JS tools)
- metadata-file preview tab group
- aggregate progress + per-file progress row
- dialog / modal (resume, confirm-live)
- dry-run banner

## Out of scope (don't design these)

Image tagging (separate tool), deployment creation/editing, user
management, video/RAW/non-JPEG, multi-deployment batches, "fix existing
upload" flows, mobile or tablet layouts.

## Framing

Describe the tool by what it **is** and **does**, alongside SPARC'd. Avoid
positioning it relative to other systems.
