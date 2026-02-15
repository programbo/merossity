import type { MerossCloudDevice } from '../../lib/types'
import { DeviceCard } from './DeviceCard'

export function DeviceGroup(props: {
  title: string
  uuids: string[]
  deviceByUuid: Map<string, MerossCloudDevice>
  emptyTitle: string
  emptyCopy: string
}) {
  return (
    <section className="grid gap-3">
      <header className="flex items-center justify-between gap-3 px-0.5 pb-1">
        <div className="text-muted text-[12px] tracking-[0.16em] uppercase">{props.title}</div>
      </header>

      {props.uuids.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-white/20 bg-white/3 p-4">
          <div className="text-foreground text-[18px] leading-tight font-[var(--font-display)]">{props.emptyTitle}</div>
          <div className="text-muted mt-1 text-[13px] leading-relaxed">{props.emptyCopy}</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {props.uuids.map((uuid) => (
            <DeviceCard key={uuid} uuid={uuid} device={props.deviceByUuid.get(uuid) ?? null} />
          ))}
        </div>
      )}
    </section>
  )
}
