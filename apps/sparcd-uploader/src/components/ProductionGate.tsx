// P6 production gate. Shown when a wet upload (fresh or resumed) targets a
// bucket flagged production (VITE_S3_PROD_BUCKETS) — the lift out of test
// buckets. Writing canonical data into a production collection is gated on two
// things the app cannot verify itself, so it requires the operator to affirm
// them, each session, before the dry-run lock releases:
//
//   1. Reader sentinel rollout — every reader this project controls ignores
//      upload prefixes that lack UploadComplete.json, so a half-written prefix
//      is never surfaced (open question 6 / safety layer 4).
//   2. A recorded second review of @sparcd/s3-safe, the upload sequence, and a
//      successful test-bucket dry-run log (safety layer 3).
//
// The acknowledgment lives in session-only store state (productionAck): never
// persisted, reset on connect/disconnect/nextBatch, so the friction is
// deliberate rather than sticky. Test buckets never render this.

import { useStore } from '../store';

export function ProductionGate({ bucket }: { bucket: string }) {
  const ack = useStore((s) => s.productionAck);
  const setAck = useStore((s) => s.setProductionAck);

  return (
    <div className="border border-warn/60 bg-paper px-4 py-3.5 space-y-3">
      <p className="font-body text-[13px] text-warn">
        <span className="font-mono uppercase tracking-[0.12em] text-[11px]">Production</span> —{' '}
        <span className="font-mono text-ink break-all">{bucket}</span> is not a test bucket. Wet
        writes here publish canonical data and are gated on a recorded review.
      </p>
      <ul className="font-body text-[12.5px] text-inkSoft list-disc pl-5 space-y-1">
        <li>
          Every reader this project controls ignores upload prefixes without{' '}
          <span className="font-mono text-ink">UploadComplete.json</span>.
        </li>
        <li>
          A second review of <span className="font-mono text-ink">@sparcd/s3-safe</span>, the upload
          sequence, and a successful test-bucket dry-run log is recorded.
        </li>
      </ul>
      <label className="flex items-start gap-2.5 font-body text-[13px] text-ink">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="accent-accent mt-0.5"
        />
        I confirm both gates above are complete for this deployment.
      </label>
    </div>
  );
}
