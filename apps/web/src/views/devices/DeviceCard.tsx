import { useMemo, useState } from 'react'
import type { MerossCloudDevice } from '../../lib/types'
import { useDevicesActorRef, useDevicesSelector } from '../../state/devicesActor'
import { cls } from '../../ui/cls'
import { RefreshIcon } from '../../ui/icons/RefreshIcon'
import { Button } from '../../ui/rac/Button'
import { Disclosure, DisclosurePanel, DisclosureTrigger } from '../../ui/rac/Disclosure'
import { Switch } from '../../ui/rac/Switch'

type LanToggleXChannel = { channel: number; onoff: 0 | 1 }
type DeviceState = {
  host: string
  channel: number
  onoff: 0 | 1
  channels?: LanToggleXChannel[]
  updatedAt: number
  stale?: boolean
  source?: string
  error?: string
}

const friendlyDeviceTypeFromModel = (model: string) => {
  const m = String(model ?? '')
    .trim()
    .toUpperCase()
  if (!m) return ''

  if (m.startsWith('MSS')) return 'Smart Wi-Fi Plug'
  if (m.startsWith('MSL')) return 'Smart Wi-Fi Light'
  if (m.startsWith('MSP')) return 'Smart Power Strip'
  if (m.startsWith('MTS')) return 'Smart Thermostat'
  if (m.startsWith('MSH')) return 'Smart Sensor'
  if (m.startsWith('MSG')) return 'Smart Garage Opener'
  if (m.startsWith('MRS')) return 'Smart Roller Shutter'

  return ''
}

const prefersToggleFor = (d: { deviceType?: unknown; subType?: unknown }) => {
  const typeKey = `${String(d.deviceType ?? '')} ${String(d.subType ?? '')}`.toLowerCase()
  return typeKey.includes('msl') || typeKey.includes('mss') || typeKey.includes('light') || typeKey.includes('switch')
}

export function DeviceCard(props: { uuid: string; device: MerossCloudDevice | null }) {
  const devices = useDevicesActorRef()
  const uuid = props.uuid

  const hostEntry = useDevicesSelector(
    (s) => s.context.hosts[uuid] as { host: string; updatedAt: string; mac?: string } | undefined,
  )
  const deviceState = useDevicesSelector((s) => s.context.deviceStates[uuid] as DeviceState | undefined)
  const isToggling = useDevicesSelector(
    (s) => s.matches({ operations: 'toggling' }) && s.context.activeDeviceUuid === uuid,
  )
  const isFetchingDiagnostics = useDevicesSelector(
    (s) => s.matches({ operations: 'fetchingDiagnostics' }) && s.context.activeDeviceUuid === uuid,
  )

  const [isExpanded, setExpanded] = useState(false)

  const d = props.device ?? ({ uuid } as MerossCloudDevice)

  const host = hostEntry?.host ? String(hostEntry.host) : ''
  const hostUpdatedAt = hostEntry?.updatedAt ? String(hostEntry.updatedAt) : ''

  const title = String(d.devName ?? '') || uuid
  const model = String(d.deviceType ?? '').trim()
  const typeLabel = friendlyDeviceTypeFromModel(model)
  const subtitle = [typeLabel, model].filter(Boolean).join(' / ')

  const macCloud = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
  const macLan = hostEntry?.mac ? String(hostEntry.mac) : ''
  const mac = macCloud || macLan

  const ready = Boolean(host)

  const ch0 =
    deviceState?.channels?.find((c) => c.channel === 0) ??
    (deviceState ? { channel: 0, onoff: deviceState.onoff } : null)
  const lanOn = ch0 ? ch0.onoff === 1 : null

  const togglable = ready && prefersToggleFor(d)
  const toggleDisabled = !ready || isToggling

  const lanDesc = !ready
    ? 'ip unavailable'
    : deviceState
      ? `${deviceState.stale ? 'stale' : 'state'} @ ${new Date(deviceState.updatedAt).toLocaleTimeString()}${deviceState.source ? ` · ${deviceState.source}` : ''}`
      : 'state unknown'

  const cardClass = useMemo(() => {
    const base = 'device-card'
    if (!ready) return cls(base, 'device-card--inaccessible')
    if (lanOn === true) return cls(base, 'device-card--on')
    if (lanOn === false) return cls(base, 'device-card--off')
    return base
  }, [lanOn, ready])

  return (
    <article className={cardClass}>
      <header className="grid gap-3 px-4 pt-4 pb-3 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-foreground text-[18px] leading-tight font-[var(--font-display)]">{title}</div>
          </div>
          <div className="text-muted mt-1 text-[12px] tracking-[0.14em] uppercase">{subtitle || 'device'}</div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
          {ready && togglable ? (
            <Switch
              isSelected={lanOn === true}
              onChange={(next) => {
                devices.send({ type: 'device_TOGGLE', uuid, onoff: next ? 1 : 0 })
              }}
              isDisabled={toggleDisabled}
              label="Power"
              description={undefined}
            />
          ) : ready ? (
            <>
              <Button
                tone="ghost"
                onPress={() => devices.send({ type: 'device_TOGGLE', uuid, onoff: 1 })}
                isDisabled={toggleDisabled}
                isPending={isToggling}
              >
                On
              </Button>
              <Button
                tone="danger"
                onPress={() => devices.send({ type: 'device_TOGGLE', uuid, onoff: 0 })}
                isDisabled={toggleDisabled}
                isPending={isToggling}
              >
                Off
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          setExpanded(next)
          if (next && ready) {
            devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
          }
        }}
        className="mx-4 mb-4"
      >
        <DisclosureTrigger>
          <span>Details</span>
        </DisclosureTrigger>
        <DisclosurePanel>
          <div className="border-t border-white/10 px-3 py-3">
            <div className="text-muted grid gap-2 text-[12px]">
              <div>
                <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">ip</span>{' '}
                <span className="text-foreground/90 break-all">{host || '(unknown)'}</span>
              </div>
              <div>
                <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">uuid</span>{' '}
                <span className="text-foreground/90 break-all">{uuid}</span>
              </div>
              {mac ? (
                <div>
                  <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">mac</span>{' '}
                  <span className="text-foreground/90 break-all">{mac}</span>
                </div>
              ) : null}
              {hostUpdatedAt ? (
                <div>
                  <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">ip seen</span>{' '}
                  <span className="text-foreground/90 break-all">{hostUpdatedAt}</span>
                </div>
              ) : null}
            </div>

            {ready ? (
              <div className="mt-3 grid gap-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
                  <div
                    className={cls(
                      'rounded-full border px-3 py-1 text-[11px] tracking-[0.16em] uppercase',
                      deviceState?.stale
                        ? 'border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-white/90'
                        : 'border-white/15 bg-white/5 text-white/80',
                    )}
                  >
                    {lanDesc}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    tone="quiet"
                    onPress={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
                    isDisabled={!host}
                    icon={<RefreshIcon />}
                  >
                    Refresh state
                  </Button>
                  <Button
                    tone="ghost"
                    onPress={() => devices.send({ type: 'device_DIAGNOSTICS', uuid })}
                    isDisabled={isFetchingDiagnostics || !host}
                    isPending={isFetchingDiagnostics}
                  >
                    Fetch diagnostics
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DisclosurePanel>
      </Disclosure>
    </article>
  )
}
