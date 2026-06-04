import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store';
import { useTagImages, useSpecies } from '../lib/queries';
import { parseCollectionKey, presignImage } from '../lib/s3';
import { Thumb } from '../components/Thumb';
import { SpeciesPanel } from '../components/SpeciesPanel';
import {
  useDraftStore,
  dirtyCount,
  GHOST,
  type AppliedTag,
  type UploadCtx,
} from '../lib/drafts';
import { useKeyBindings, effectiveKey, normalizeJavaKeyCode } from '../lib/keys';
import type { Species } from '../lib/species';
import type { TagImage } from '../lib/workspace';
import type { DraftRecord } from '../lib/db';

const GHOST_KEY = 'g';
const RECENT_LIMIT = 12;

// What's actually applied to one image: the local draft wins over the canonical
// base it was grounded on.
type Effective = {
  label: string;
  commonName: string;
  count: number;
  questionable: boolean;
  requested: string;
  source: 'draft' | 'base' | 'none';
};

function effectiveOf(img: TagImage, draft: DraftRecord | undefined): Effective {
  if (draft) {
    return {
      label: draft.label,
      commonName: draft.commonName,
      count: draft.count,
      questionable: draft.questionable,
      requested: draft.requestedSpecies,
      source: 'draft',
    };
  }
  if (img.baseLabel)
    return {
      label: img.baseLabel,
      commonName: img.baseCommonName,
      count: img.baseCount,
      questionable: false,
      requested: img.baseRequested,
      source: 'base',
    };
  return { label: '', commonName: '', count: 0, questionable: false, requested: '', source: 'none' };
}

export function Tag() {
  const cfg = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const collectionKey = useStore((s) => s.selectedCollectionKey);
  const uploadPrefix = useStore((s) => s.selectedUploadPrefix);

  const images = useTagImages(cfg, connectionId, collectionKey, uploadPrefix);
  const species = useSpecies(cfg, connectionId);

  const { bucket } = collectionKey ? parseCollectionKey(collectionKey) : { bucket: '' };
  const ctx = useMemo<UploadCtx>(() => ({ bucket, uploadPrefix: uploadPrefix ?? '' }), [bucket, uploadPrefix]);

  const drafts = useDraftStore((s) => s.drafts);
  const loadUpload = useDraftStore((s) => s.loadUpload);
  const applyTagFn = useDraftStore((s) => s.applyTag);
  const detagFn = useDraftStore((s) => s.detag);
  const toggleQ = useDraftStore((s) => s.toggleQuestionable);
  const discardUpload = useDraftStore((s) => s.discardUpload);

  // Hydrate drafts for this upload from Dexie when it changes.
  useEffect(() => {
    if (bucket && uploadPrefix) void loadUpload({ bucket, uploadPrefix });
  }, [bucket, uploadPrefix, loadUpload]);

  const [focus, setFocus] = useState(0);
  const [count, setCount] = useState(1);
  const [filter, setFilter] = useState('');
  const [capturingFor, setCapturingFor] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const filterRef = useRef<HTMLInputElement>(null);

  const list = images.data ?? [];
  const current = list[focus];

  // Reset focus when the upload changes / data arrives.
  useEffect(() => {
    setFocus(0);
  }, [uploadPrefix, images.data]);

  const { overrides, assignKey, clearKey } = useKeyBindings();
  const speciesList = species.data?.species ?? [];

  const bindingFor = (sci: string): string | null => {
    const k = effectiveKey(sci, speciesJsonKey(speciesList, sci), overrides);
    return k ? k.toUpperCase() : null;
  };

  // key char → action, built once per species/override change. Precedence
  // low→high: Ghost default, species.json bindings, then local overrides.
  const keyMap = useMemo(() => {
    const m = new Map<string, { kind: 'ghost' } | { kind: 'species'; species: Species }>();
    m.set(GHOST_KEY, { kind: 'ghost' });
    for (const s of speciesList) {
      const k = normalizeJavaKeyCode(s.keyBinding);
      if (k) m.set(k, { kind: 'species', species: s });
    }
    for (const s of speciesList) {
      const ov = overrides[s.scientificName];
      if (ov) m.set(ov, { kind: 'species', species: s });
    }
    return m;
  }, [speciesList, overrides]);

  const pushRecent = (sci: string) =>
    setRecent((r) => [sci, ...r.filter((x) => x !== sci)].slice(0, RECENT_LIMIT));

  const apply = (tag: AppliedTag) => {
    if (!current) return;
    applyTagFn(ctx, current.key, current.deploymentId, tag);
    if (tag.label) pushRecent(tag.label);
  };

  // --- Global key handler: attached once, reads the latest state via a ref so
  // it never re-binds per render (plan perf requirement). ----------------------
  const stateRef = useRef<HandlerState>(null!);
  stateRef.current = {
    list,
    focus,
    setFocus,
    ctx,
    count,
    keyMap,
    capturingFor,
    setCapturingFor,
    assignKey,
    apply,
    detagFn,
    toggleQ,
    filterRef,
    speciesList,
    filter,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e, stateRef.current);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!current && images.isLoading)
    return <Centered>Loading the upload’s canonical media…</Centered>;
  if (images.isError)
    return <Centered tone="warn">{(images.error as Error).message}</Centered>;
  if (!list.length) return <Centered>This upload has no taggable images.</Centered>;

  const draft = current ? drafts[current.key] : undefined;
  const eff = current ? effectiveOf(current, draft) : null;
  const nDirty = dirtyCount(drafts);

  return (
    <div className="h-full grid grid-cols-[260px_1fr_340px] min-h-0">
      {/* Image strip */}
      <aside className="border-r border-rule bg-panel overflow-y-auto min-h-0">
        <div className="sticky top-0 z-10 bg-panel border-b border-rule px-3 py-2 flex items-center justify-between">
          <span className="text-[12px] font-mono text-inkSoft">
            {focus + 1} / {list.length}
          </span>
          {nDirty > 0 && (
            <button
              onClick={() => {
                if (confirm(`Discard ${nDirty} local edit(s) for this upload?`)) void discardUpload(ctx);
              }}
              className="text-[11px] font-mono text-inkMute hover:text-warn underline decoration-dotted"
              title="Discard local changes for this upload"
            >
              {nDirty} unsaved · discard
            </button>
          )}
        </div>
        <ul>
          {list.map((img, i) => (
            <StripRow
              key={img.key}
              img={img}
              index={i}
              active={i === focus}
              onSelect={() => setFocus(i)}
            />
          ))}
        </ul>
      </aside>

      {/* Focus view */}
      <div className="flex flex-col min-h-0 bg-paper">
        <div className="flex-1 min-h-0 grid place-items-center p-4 overflow-hidden">
          {current && <FocusImage objectKey={current.key} alt={current.fileName} />}
        </div>
        {current && eff && (
          <div className="shrink-0 border-t border-rule bg-panel px-5 py-3 flex items-center gap-5 flex-wrap">
            <div className="min-w-0">
              <div className="text-[14px] font-mono text-ink truncate" title={current.fileName}>
                {current.fileName}
              </div>
              <div className="text-[12px] font-mono text-inkMute">
                {current.baseTimestamp || '— no timestamp —'} · {shortDeployment(current.deploymentId)}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {eff.questionable && (
                <span className="text-[12px] font-mono text-warn border border-warn px-2 py-0.5">questionable</span>
              )}
              <TagChip eff={eff} />
              <button
                onClick={() => current && detagFn(ctx, current.key, current.deploymentId)}
                disabled={!eff.label && eff.source !== 'base'}
                className="text-[13px] border border-rule px-2.5 py-1 text-inkSoft hover:text-ink hover:border-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                title="Remove the species from this image"
              >
                Detag
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Species panel */}
      <SpeciesPanel
        species={speciesList}
        count={count}
        onCountChange={setCount}
        onApply={apply}
        filter={filter}
        onFilterChange={setFilter}
        filterRef={filterRef}
        bindingFor={bindingFor}
        capturingFor={capturingFor}
        onStartCapture={setCapturingFor}
        onClearKey={clearKey}
        recent={recent}
        currentLabel={eff?.label ?? ''}
        disabled={!current}
      />
    </div>
  );
}

// --- Strip row (subscribes only to its own draft, so editing one image does not
// re-render the whole strip). ------------------------------------------------
function StripRow({
  img,
  index,
  active,
  onSelect,
}: {
  img: TagImage;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const draft = useDraftStore((s) => s.drafts[img.key]);
  const eff = effectiveOf(img, draft);
  return (
    <li>
      <button
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left border-b border-ruleSoft ${
          active ? 'bg-mark' : 'hover:bg-panelHover'
        }`}
      >
        <span className="w-12 shrink-0">
          <Thumb objectKey={img.key} alt={img.fileName} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-mono text-inkSoft truncate" title={img.fileName}>
            {img.fileName}
          </span>
          <span className="block text-[12px] truncate">
            {eff.label ? (
              <span className="text-ink">
                {eff.commonName || eff.label}
                {eff.count > 1 && <span className="text-inkMute"> ×{eff.count}</span>}
              </span>
            ) : (
              <span className="text-inkMute">untagged</span>
            )}
          </span>
        </span>
        <span className="shrink-0 flex flex-col items-end gap-0.5">
          {eff.source === 'draft' && eff.label !== img.baseLabel && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent" title="unsaved edit" />
          )}
          {eff.questionable && <span className="text-[11px] text-warn" title="questionable">?</span>}
          <span className="text-[11px] font-mono text-inkMute">{index + 1}</span>
        </span>
      </button>
    </li>
  );
}

function TagChip({ eff }: { eff: Effective }) {
  if (!eff.label) return <span className="text-[13px] font-mono text-inkMute">untagged</span>;
  const isGhost = eff.label === GHOST.label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] border ${
        isGhost ? 'border-rule text-inkSoft' : 'border-ink text-ink'
      }`}
    >
      {isGhost ? '◯ Ghost' : eff.commonName || eff.label}
      {eff.count > 1 && <span className="font-mono text-inkMute">×{eff.count}</span>}
      {eff.requested && <span className="font-mono text-inkMute text-[11px]">requested</span>}
    </span>
  );
}

function FocusImage({ objectKey, alt }: { objectKey: string; alt: string }) {
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
    staleTime: 50 * 60 * 1000,
    retry: 1,
  });
  if (isError)
    return <div className="text-[13px] font-mono text-warn">Could not load this image.</div>;
  if (!data) return <div className="text-[13px] font-mono text-inkMute">…</div>;
  return <img src={data} alt={alt} className="max-w-full max-h-full object-contain" />;
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <p className={`text-[15px] font-body ${tone === 'warn' ? 'text-warn' : 'text-inkMute'}`}>
        {children}
      </p>
    </div>
  );
}

// The deploymentId is "<collection-uuid>:<location-id>"; show the readable tail.
function shortDeployment(deploymentId: string): string {
  const tail = deploymentId.split(':').pop() ?? deploymentId;
  return tail || deploymentId;
}

function speciesJsonKey(list: Species[], sci: string): string | null {
  return list.find((s) => s.scientificName === sci)?.keyBinding ?? null;
}

// --- Global key handler -----------------------------------------------------

type HandlerState = {
  list: TagImage[];
  focus: number;
  setFocus: (n: number) => void;
  ctx: UploadCtx;
  count: number;
  keyMap: Map<string, { kind: 'ghost' } | { kind: 'species'; species: Species }>;
  capturingFor: string | null;
  setCapturingFor: (v: string | null) => void;
  assignKey: (sci: string, key: string) => void;
  apply: (tag: AppliedTag) => void;
  detagFn: (ctx: UploadCtx, mediaPath: string, deploymentId: string) => void;
  toggleQ: (ctx: UploadCtx, mediaPath: string, deploymentId: string) => void;
  filterRef: React.RefObject<HTMLInputElement>;
  speciesList: Species[];
  filter: string;
};

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function handleKey(e: KeyboardEvent, s: HandlerState): void {
  // Key-capture mode for "assign key" — swallow the next printable key.
  if (s.capturingFor) {
    if (e.key === 'Escape') {
      s.setCapturingFor(null);
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      s.assignKey(s.capturingFor, e.key.toLowerCase());
      s.setCapturingFor(null);
    }
    return;
  }

  const typing = isTypingTarget(e.target);

  // Escape blurs the filter. Enter applies the first filter match.
  if (typing) {
    if (e.key === 'Escape') s.filterRef.current?.blur();
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = s.filter.trim().toLowerCase();
      const match =
        q &&
        s.speciesList.find(
          (sp) =>
            sp.commonName.toLowerCase().includes(q) || sp.scientificName.toLowerCase().includes(q),
        );
      if (match) s.apply({ label: match.scientificName, commonName: match.commonName, count: s.count });
      s.filterRef.current?.blur();
    }
    return;
  }

  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const current = s.list[s.focus];
  switch (e.key) {
    case 'j':
    case 'J':
    case 'ArrowDown':
      e.preventDefault();
      s.setFocus(Math.min(s.focus + 1, s.list.length - 1));
      return;
    case 'k':
    case 'K':
    case 'ArrowUp':
      e.preventDefault();
      s.setFocus(Math.max(s.focus - 1, 0));
      return;
    case ' ':
      e.preventDefault();
      s.filterRef.current?.focus();
      return;
    case 'x':
    case 'X':
      if (current) s.toggleQ(s.ctx, current.key, current.deploymentId);
      return;
  }

  const action = s.keyMap.get(e.key.toLowerCase());
  if (!action || !current) return;
  e.preventDefault();
  if (action.kind === 'ghost') s.apply({ label: GHOST.label, commonName: GHOST.commonName, count: s.count });
  else s.apply({ label: action.species.scientificName, commonName: action.species.commonName, count: s.count });
}
