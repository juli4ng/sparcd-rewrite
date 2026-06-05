import { useStore } from '../store';
import { useCollections, useUploads, useSpecies } from '../lib/queries';

const kicker = 'font-body text-[11px] font-[600] tracking-[0.16em] uppercase text-inkSoft';

// Browse is the entry point: pick a collection in the rail, then pick one of
// its uploads in the main panel — choosing an upload opens the Tag workspace.
export function Browse() {
  const cfg = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const collectionKey = useStore((s) => s.selectedCollectionKey);
  const selectCollection = useStore((s) => s.selectCollection);
  const selectUpload = useStore((s) => s.selectUpload);

  const collections = useCollections(cfg, connectionId);
  const uploads = useUploads(cfg, connectionId, collectionKey);
  const species = useSpecies(cfg, connectionId); // loaded once; surfaced as a status line

  const collection = collections.data?.find((c) => c.key === collectionKey);

  return (
    <div className="h-full grid grid-cols-[280px_1fr] min-h-0">
      {/* Collection rail */}
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

        <p className="text-[12px] text-inkMute font-body border-t border-ruleSoft pt-3">
          {species.isLoading && 'Loading species vocabulary…'}
          {species.isError && `Species vocabulary unavailable: ${(species.error as Error).message}`}
          {species.data &&
            `${species.data.species.length} species loaded from ${species.data.settingsBucket}` +
              (species.data.skipped.length ? ` (${species.data.skipped.length} skipped)` : '')}
        </p>
      </aside>

      {/* Uploads for the chosen collection */}
      <div className="overflow-y-auto p-5">
        {!collectionKey && <Empty>Select a collection to see its uploads.</Empty>}
        {collectionKey && (
          <>
            <h1 className="font-display text-[20px] text-ink mb-4">
              {collection?.name ?? collection?.bucket ?? 'Uploads'}
            </h1>
            <Status q={uploads} empty="No uploads in this collection." />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {uploads.data?.map((u) => (
                <li key={u.prefix}>
                  <button
                    onClick={() => selectUpload(u.prefix)}
                    className="w-full text-left px-3 py-2.5 text-[13px] font-mono text-inkSoft border border-rule hover:bg-panelHover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {u.stamp}
                  </button>
                </li>
              ))}
            </ul>
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
