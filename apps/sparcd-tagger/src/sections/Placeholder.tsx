// Stand-ins for the sections that land in later phases (Tag = P1–P3, History =
// P5/P6). They keep the chrome navigable end-to-end without implying the tool
// can already do work it can't.
export function Placeholder({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="max-w-[420px] text-center space-y-2">
        <h1 className="font-display text-[22px] text-ink">{title}</h1>
        <p className="text-[14px] text-inkSoft font-body">{children}</p>
        <p className="text-[12px] font-mono text-inkMute uppercase tracking-[0.16em]">{phase}</p>
      </div>
    </div>
  );
}
