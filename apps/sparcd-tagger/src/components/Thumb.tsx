import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store';
import { parseCollectionKey, presignImage } from '../lib/s3';

// One presigned-GET thumbnail. The URL is signed lazily (per connection +
// object key) and rendered straight into <img> — no canvas, so no CORS taint.
// Camera-trap originals are 1–5MB; P0 renders the original to prove the read
// path end-to-end, and the virtualized/progressive grid lands in P1+.
export function Thumb({ objectKey, alt }: { objectKey: string; alt: string }) {
  const cfg = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const collectionKey = useStore((s) => s.selectedCollectionKey);

  const { data, isError } = useQuery({
    queryKey: ['presign', connectionId, objectKey],
    queryFn: () => {
      const { bucket } = parseCollectionKey(collectionKey!);
      return presignImage(cfg!, bucket, objectKey);
    },
    enabled: !!cfg && !!collectionKey,
    staleTime: 50 * 60 * 1000, // under the 1h URL TTL
    retry: 1,
  });

  if (isError) {
    return (
      <div className="aspect-[4/3] bg-paperHover border border-rule grid place-items-center text-[11px] font-mono text-warn">
        failed
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] bg-paperHover border border-rule overflow-hidden">
      {data && (
        <img src={data} alt={alt} loading="lazy" className="w-full h-full object-cover" />
      )}
    </div>
  );
}
