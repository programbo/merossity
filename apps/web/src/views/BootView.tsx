export function BootView() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pt-6 pb-24">
      <header className="glass-panel shadow-panel grid gap-3 rounded-[var(--radius-xl)] px-5 py-4">
        <div className="text-[42px] leading-[0.92] font-[var(--font-display)] tracking-[-0.02em]">Merossity</div>
        <div className="text-muted text-[13px] leading-relaxed">Loading…</div>
      </header>
    </div>
  )
}
