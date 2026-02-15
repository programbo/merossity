import { useCallback, useEffect, useMemo, useRef } from 'react'
import { groupDevicesForControl } from '@merossity/core/meross/inventory'
import { Heading } from 'react-aria-components'
import type { MerossCloudDevice } from '../../lib/types'
import { useDevicesActorRef, useDevicesSelector } from '../../state/devicesActor'
import { cls } from '../../ui/cls'
import { RefreshIcon } from '../../ui/icons/RefreshIcon'
import { Button } from '../../ui/rac/Button'
import { Modal } from '../../ui/rac/Modal'
import { useToast } from '../../ui/toast'
import { DeviceGroup } from './DeviceGroup'

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

export function InventoryView() {
  const devices = useDevicesSelector((s) => s.context.devices)
  const hosts = useDevicesSelector((s) => s.context.hosts)
  const isScanning = useDevicesSelector(
    (s) => s.matches({ inventory: 'discoveringHosts' }) || s.matches({ inventory: 'suggestingCidr' }),
  )
  const isRefreshing = useDevicesSelector((s) => s.matches({ inventory: 'refreshingCloud' }))
  const streamDegraded = useDevicesSelector((s) => s.matches({ monitor: 'degraded' }))
  const systemDump = useDevicesSelector((s) => s.context.systemDump)
  const devicesActor = useDevicesActorRef()
  const toast = useToast()

  const didAutoLoadRef = useRef(false)
  const shouldScanAfterRefreshRef = useRef(false)
  const sawRefreshStartRef = useRef(false)

  const reloadBusy = Boolean(isRefreshing || isScanning)
  const reloadWorkingLabel = isRefreshing ? 'Syncing devices' : isScanning ? 'Scanning LAN' : ''

  const deviceByUuid = useMemo(() => {
    const map = new Map<string, MerossCloudDevice>()
    for (const d of devices ?? []) {
      const uuid = String((d as any)?.uuid ?? '')
      if (!uuid) continue
      map.set(uuid, d)
    }
    return map
  }, [devices])

  const groups = useMemo(() => groupDevicesForControl(devices, hosts), [devices, hosts])
  const readyUuids = useMemo(() => groups.ready.map((d) => d.uuid), [groups.ready])
  const inaccessibleUuids = useMemo(() => groups.inaccessible.map((d) => d.uuid), [groups.inaccessible])

  const systemDumpText = useMemo(() => (systemDump ? JSON.stringify(systemDump.data, null, 2) : ''), [systemDump])

  const copySystemDump = useCallback(async () => {
    if (!systemDumpText) return

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(systemDumpText)
      } else {
        const ta = document.createElement('textarea')
        ta.value = systemDumpText
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        ta.style.top = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }

      toast.show({ kind: 'ok', title: 'Copied diagnostics JSON', detail: 'Ready to paste.' })
    } catch (err) {
      toast.show({
        kind: 'err',
        title: 'Copy failed',
        detail: err instanceof Error ? err.message : 'Clipboard unavailable.',
      })
    }
  }, [systemDumpText, toast])

  const startReload = () => {
    shouldScanAfterRefreshRef.current = true
    devicesActor.send({ type: 'REFRESH' })
  }

  useEffect(() => {
    if (didAutoLoadRef.current) return
    didAutoLoadRef.current = true
    shouldScanAfterRefreshRef.current = true
    devicesActor.send({ type: 'REFRESH' })
  }, [devicesActor])

  useEffect(() => {
    if (isRefreshing) {
      sawRefreshStartRef.current = true
      return
    }
    if (!shouldScanAfterRefreshRef.current) return
    if (!sawRefreshStartRef.current) return
    sawRefreshStartRef.current = false
    shouldScanAfterRefreshRef.current = false
    devicesActor.send({ type: 'SCAN' })
  }, [isRefreshing, devicesActor])

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pt-6 pb-24">
      <header className="glass-panel shadow-panel grid gap-3 rounded-[var(--radius-xl)] px-5 py-4">
        <div className="text-[42px] leading-[0.92] font-[var(--font-display)] tracking-[-0.02em]">Merossity</div>
      </header>

      <main className="mt-4">
        <section className="glass-panel shadow-panel overflow-hidden rounded-[var(--radius-xl)]">
          <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
            <div>
              <div className="text-[22px] leading-tight font-[var(--font-display)]">Devices</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {streamDegraded ? (
                <div className="rounded-full border border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-3 py-2 text-[12px] tracking-[0.08em] text-white/90 uppercase">
                  Live updates degraded
                </div>
              ) : null}
              {reloadBusy ? (
                <div className="text-muted text-[11px] tracking-[0.18em] uppercase">{reloadWorkingLabel}</div>
              ) : null}
              <Button
                tone="quiet"
                aria-label="Reload devices (refresh + scan LAN)"
                onPress={startReload}
                isDisabled={reloadBusy}
                className={cls('btn-iconOnly reload-glow', reloadBusy ? 'is-busy' : '')}
                icon={<RefreshIcon className={reloadBusy ? 'icon-spin' : undefined} />}
              />
            </div>
          </header>

          <div className="grid gap-4 p-4">
            {isScanning ? (
              <div className="grid gap-2 rounded-[var(--radius-lg)] border border-white/15 bg-white/5 p-4 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
                <div>
                  <div className="text-muted text-[11px] tracking-[0.18em] uppercase">Scanning LAN</div>
                  <div className="text-muted mt-1 text-[13px] leading-relaxed">
                    Looking up IPs. Devices with a known IP remain controllable while scan runs.
                  </div>
                </div>
              </div>
            ) : null}

            {devices.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-white/20 bg-white/3 p-4">
                <div className="text-foreground text-[18px] leading-tight font-[var(--font-display)]">
                  No devices yet.
                </div>
                <div className="text-muted mt-1 text-[13px] leading-relaxed">
                  Reload to pull devices from cloud and scan your LAN for IPs.
                </div>
              </div>
            ) : (
              <div className="grid gap-5 pt-2">
                <DeviceGroup
                  title="Ready to control"
                  uuids={readyUuids}
                  deviceByUuid={deviceByUuid}
                  emptyTitle="No devices ready yet."
                  emptyCopy="Discovered, controllable devices will appear here."
                />
                <DeviceGroup
                  title="Inaccessible"
                  uuids={inaccessibleUuids}
                  deviceByUuid={deviceByUuid}
                  emptyTitle="No inaccessible devices."
                  emptyCopy="If all devices are reachable, this section stays empty."
                />
              </div>
            )}
          </div>

          <Modal
            isDismissable
            isOpen={Boolean(systemDump)}
            onOpenChange={(open) => {
              if (!open) devicesActor.send({ type: 'CLOSE_SYSTEM_DUMP' })
            }}
          >
            {systemDump ? (
              <div className="grid gap-3 p-4">
                <Heading slot="title" className="m-0 text-[20px] leading-tight font-[var(--font-display)]">
                  Diagnostics: Appliance.System.All
                </Heading>
                <div className="text-muted grid gap-1 text-[12px] tracking-[0.14em] uppercase">
                  <div>{clampText(systemDump.uuid, 22)}</div>
                  <div>{systemDump.host}</div>
                </div>
                <pre className="m-0 max-h-[54vh] overflow-auto rounded-[var(--radius-lg)] border border-white/15 bg-black/30 p-4 text-[12px] leading-relaxed text-white/90">
                  {systemDumpText}
                </pre>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button tone="quiet" onPress={copySystemDump}>
                    Copy JSON
                  </Button>
                  <Button tone="ghost" slot="close" onPress={() => devicesActor.send({ type: 'CLOSE_SYSTEM_DUMP' })}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </Modal>
        </section>
      </main>
    </div>
  )
}
