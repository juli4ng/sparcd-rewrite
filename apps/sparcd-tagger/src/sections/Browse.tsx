import { useStore } from '../store';
import { useCollections, useUploads, useUploadImages, useSpecies } from '../lib/queries';
import { Thumb } from '../components/Thumb';

const kicker = 'font-body text-[11px] font-[600] tracking-[0.16em] uppercase text-inkSoft';

// Browse is the entry point: pick a collection, pick an upload, see its images.
// In P0 this is the proof that the tool discovers a collection and reads its
// images end-to-end; choosing an upload opens the Tag workspace (P1+).
export function Browse() {
  const cfg = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const collectionKey = useStore((s) => s.selectedCollectionKey);
  const uploadPrefix = useStore((s) => s.selectedUploadPrefix);
  const selectCollection = useStore((s) => s.selectCollection);
  const selectUpload = useStore((s) => s.selectUpload);

  const collections = useCollections(cfg, connectionId);
  const uploads = useUploads(cfg, connectionId, collectionKey);
  const images = useUploadImages(cfg, connectionId, collectionKey, uploadPrefix);
  const species = useSpecies(cfg, connectionId); // loaded once; surfaced as a status line

  return (
    <div className="h-full grid grid-cols-[280px_1fr] min-h-0">
      {/* Collection + upload rail */}
      <aside className="border-r border-rule bg-panel overflow-y-auto p-4 space-y-6">
        <section>
          <h2 className={kicker}>Collections</h2>
          <Status q={collections} empty="No collections visible to these credentials." />
          <ul className="mt-2 space-y-1">
            {collections.data?.map((c) => (
              <li key={c.key}>
                <button
                  onClick={() => selectCollection(c.key)}
                  aria-current={c.key === collectionKey ? 'true' : undefined}
                  className={`w-full text-left px-2.5 py-1.5 text-[14px] border border-transparent hover:bg-panelHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    c.key === collectionKey ? 'bg-mark border-rule' : ''
                  }`}
                >
                  <div className="text-ink">{c.name ?? c.bucket}</div>
                  {c.organization && (
                    <div className="text-[12px] text-inkMute font-mono">{c.organization}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {collectionKey && (
          <section>
            <h2 className={kicker}>Uploads</h2>
            <Status q={uploads} empty="No uploads in this collection." />
            <ul className="mt-2 space-y-1">
              {uploads.data?.map((u) => (
                <li key={u.prefix}>
                  <button
                    onClick={() => selectUpload(u.prefix)}
                    aria-current={u.prefix === uploadPrefix ? 'true' : undefined}
                    className={`w-full text-left px-2.5 py-1.5 text-[13px] font-mono border border-transparent hover:bg-panelHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      u.prefix === uploadPrefix ? 'bg-mark border-rule' : 'text-inkSoft'
                    }`}
                  >
                    {u.stamp}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[12px] text-inkMute font-body border-t border-ruleSoft pt-3">
          {species.isLoading && 'Loading species vocabulary…'}
          {species.isError && `Species vocabulary unavailable: ${(species.error as Error).message}`}
          {species.data &&
            `${species.data.species.length} species loaded from ${species.data.settingsBucket}` +
              (species.data.skipped.length ? ` (${species.data.skipped.length} skipped)` : '')}
        </p>
      </aside>

      {/* Image grid for the chosen upload */}
      <div className="overflow-y-auto p-5">
        {!uploadPrefix && (
          <Empty>Select an upload to preview its images.</Empty>
        )}
        {uploadPrefix && (
          <>
            <div className="flex items-baseline justify-between mb-4">
              <h1 className="font-display text-[20px] text-ink">
                {images.data ? `${images.data.length} images` : 'Images'}
              </h1>
              <button
                onClick={() => selectUpload(uploadPrefix)}
                className="text-[14px] border border-ink px-3 py-1.5 text-ink hover:bg-panelHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                Open in Tag →
              </button>
            </div>
            <Status q={images} empty="This upload has no taggable images." />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {images.data?.map((img) => (
                <figure key={img.key} className="space-y-1">
                  <Thumb objectKey={img.key} alt={img.fileName} />
                  <figcaption className="text-[11px] font-mono text-inkMute truncate" title={img.fileName}>
                    {img.fileName}
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Status({ q, empty }: { q: { isLoading: boolean; isError: boolean; error?: unknown; data?: unknown[] }; empty: string }) {
  if (q.isLoading) return <p className="text-[13px] text-inkMute mt-2">Loading…</p>;
  if (q.isError) return <p className="text-[13px] text-warn mt-2">{(q.error as Error).message}</p>;
  if (Array.isArray(q.data) && q.data.length === 0)
    return <p className="text-[13px] text-inkMute mt-2">{empty}</p>;
  return null;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center">
      <p className="text-[15px] text-inkMute font-body">{children}</p>
    </div>
  );
}
