import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ColorThumb,
  ColorWheel,
  ColorWheelTrack,
  ColorSlider,
  Label,
  Slider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  parseColor,
  type Color,
} from 'react-aria-components'
import { apiPost } from '../../lib/api'
import { cls } from '../../ui/cls'
import { Button } from '../../ui/rac/Button'
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '../../ui/rac/Tabs'
import { useToast } from '../../ui/toast'

type LightState = {
  channel: number
  onoff: 0 | 1
  luminance?: number
  temperature?: number
  rgb?: number
}

type DeviceStateLike = {
  kind?: string
  light?: LightState | null
  lights?: LightState[]
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const rgbToHex = (rgb: number) => `#${clamp(Math.round(rgb), 0, 0xffffff).toString(16).padStart(6, '0')}`

const rgbIntFromColor = (c: Color): number | null => {
  const hex = String(c?.toString?.('hex') ?? '').trim()
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  if (!m) return null
  return Number.parseInt(m[1]!, 16)
}

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const raw = Number.parseInt(m[1]!, 16)
  return [(raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff]
}

const mixRgb = (a: readonly [number, number, number], b: readonly [number, number, number], t: number) => {
  const p = clamp(t, 0, 1)
  return [
    Math.round(a[0] + (b[0] - a[0]) * p),
    Math.round(a[1] + (b[1] - a[1]) * p),
    Math.round(a[2] + (b[2] - a[2]) * p),
  ] as const
}

const rgbToCss = (rgb: readonly [number, number, number]) => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`

function LightSlider(props: {
  label: string
  value: number
  onChange: (n: number) => void
  onChangeEnd: (n: number) => void
  disabled?: boolean
  track: 'luminance' | 'temperature'
  tintHex: string
}) {
  const fillGlow = props.track === 'temperature' ? 'rgba(45,212,191,0.20)' : 'rgba(255,106,0,0.22)'
  const trackBg =
    props.track === 'temperature'
      ? 'linear-gradient(90deg, rgba(255,160,64,0.75), rgba(255,255,255,0.08) 35%, rgba(160,236,255,0.85))'
      : `linear-gradient(90deg, rgba(255,255,255,0.10), ${props.tintHex})`

  return (
    <Slider
      value={clamp(Math.round(props.value), 0, 100)}
      onChange={(v) => props.onChange(Number(v))}
      onChangeEnd={(v) => props.onChangeEnd(Number(v))}
      minValue={0}
      maxValue={100}
      step={1}
      isDisabled={props.disabled}
      className="grid gap-2"
    >
      <div className="flex items-end justify-between gap-3">
        <Label className="text-[11px] tracking-[0.16em] text-white/55 uppercase">{props.label}</Label>
        <SliderOutput className="text-[11px] tracking-[0.16em] text-white/55 tabular-nums">
          {({ state }) => `${Math.round(state.getThumbValue(0))}`}
        </SliderOutput>
      </div>

      <div className="relative h-11 overflow-visible rounded-full border border-white/10 bg-black/20 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
        <SliderTrack
          className="group outline-none"
          // react-aria's trackProps include inline `position: relative`; override it so the track has real dimensions.
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          {({ state, isDisabled }) => {
            const pct = state.getThumbPercent(0) * 100
            const warm = [255, 160, 64] as const
            const cool = [160, 236, 255] as const
            const tint = hexToRgb(props.tintHex) ?? [255, 106, 0]
            const thumbFill =
              props.track === 'temperature' ? rgbToCss(mixRgb(warm, cool, state.getThumbPercent(0))) : rgbToCss(tint)
            return (
              <>
                <div
                  className={cls('absolute inset-[7px] rounded-full', isDisabled ? 'opacity-50' : 'opacity-100')}
                  style={{
                    background: trackBg,
                    filter: 'saturate(1.25) contrast(1.1)',
                  }}
                />
                <div
                  className="absolute inset-[7px] rounded-full"
                  style={{
                    background:
                      'radial-gradient(120px 60px at 22% 18%, rgba(255,255,255,0.18), transparent 62%), radial-gradient(160px 70px at 86% 30%, rgba(255,255,255,0.10), transparent 68%)',
                  }}
                />
                <div
                  className="absolute top-[7px] bottom-[7px] left-[7px] rounded-full"
                  style={{
                    width: `max(0px, calc(${pct}% - 7px))`,
                    background: `linear-gradient(90deg, ${fillGlow}, transparent 78%)`,
                    filter: 'blur(0.2px)',
                  }}
                />

                <SliderThumb
                  className={cls(
                    'absolute top-1/2 h-7 w-7 rounded-full border border-white/30 shadow-[0_16px_40px_rgba(0,0,0,0.55)] outline-none',
                    'before:absolute before:inset-[4px] before:rounded-full before:border before:border-white/14',
                    'data-[focus-visible]:ring-2 data-[focus-visible]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
                  )}
                  style={({ defaultStyle, isDisabled }) => ({
                    ...defaultStyle,
                    backgroundColor: isDisabled ? 'rgba(77,85,96,0.7)' : thumbFill,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 22px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset`,
                  })}
                >
                  <div
                    className="h-full w-full rounded-full"
                    style={{
                      background:
                        'radial-gradient(14px 13px at 34% 28%, rgba(255,255,255,0.34), transparent 58%), radial-gradient(17px 17px at 70% 78%, rgba(255,255,255,0.12), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.02) 58%, rgba(255,255,255,0.18))',
                    }}
                  />
                </SliderThumb>
              </>
            )
          }}
        </SliderTrack>
      </div>
    </Slider>
  )
}

export function SmartLightControls(props: {
  uuid: string
  state: DeviceStateLike | undefined
  onRequestRefresh: () => void
}) {
  const toast = useToast()

  const light0 =
    props.state?.light ??
    props.state?.lights?.find((l) => l.channel === 0) ??
    (props.state?.lights?.length ? props.state.lights[0]! : null)

  const onoff = light0?.onoff ?? 0
  const deviceLum = Number.isFinite(Number(light0?.luminance)) ? clamp(Number(light0?.luminance), 0, 100) : 50
  const deviceTemp = Number.isFinite(Number(light0?.temperature)) ? clamp(Number(light0?.temperature), 0, 100) : 50
  const deviceRgb = Number.isFinite(Number(light0?.rgb)) ? clamp(Number(light0?.rgb), 0, 0xffffff) : 0xff6a00

  const deviceHex = useMemo(() => rgbToHex(deviceRgb), [deviceRgb])

  const [mode, setMode] = useState<'white' | 'color'>(() => (light0?.temperature !== undefined ? 'white' : 'color'))
  const [draftLum, setDraftLum] = useState(deviceLum)
  const [draftTemp, setDraftTemp] = useState(deviceTemp)
  const [draftColor, setDraftColor] = useState<Color>(() => parseColor(deviceHex))

  const draggingRef = useRef<{ lum: boolean; temp: boolean; color: boolean }>({ lum: false, temp: false, color: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draggingRef.current.lum) setDraftLum(deviceLum)
  }, [deviceLum])

  useEffect(() => {
    if (!draggingRef.current.temp) setDraftTemp(deviceTemp)
  }, [deviceTemp])

  useEffect(() => {
    if (!draggingRef.current.color) setDraftColor(parseColor(deviceHex))
  }, [deviceHex])

  const sendLight = async (patch: { luminance?: number; temperature?: number; rgb?: number }) => {
    setBusy(true)
    try {
      await apiPost('/api/device/light', {
        uuid: props.uuid,
        channel: 0,
        // Treat any adjustment as intent to turn the light on.
        onoff: 1,
        ...(patch.luminance !== undefined ? { luminance: clamp(Math.round(patch.luminance), 0, 100) } : {}),
        ...(patch.temperature !== undefined ? { temperature: clamp(Math.round(patch.temperature), 0, 100) } : {}),
        ...(patch.rgb !== undefined ? { rgb: clamp(Math.round(patch.rgb), 0, 0xffffff) } : {}),
      })
      props.onRequestRefresh()
    } catch (e) {
      toast.show({
        kind: 'err',
        title: 'Light update failed',
        detail: e instanceof Error ? e.message : 'Unknown error.',
      })
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || onoff === 0

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-white/12 bg-[rgba(9,12,18,0.55)] p-3 shadow-[0_38px_110px_rgba(0,0,0,0.65)] backdrop-blur-xl backdrop-saturate-150">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(700px 220px at 18% 18%, rgba(255,106,0,0.22), transparent 60%), radial-gradient(620px 240px at 90% 10%, rgba(45,212,191,0.16), transparent 58%), radial-gradient(500px 260px at 55% 120%, rgba(255,255,255,0.05), transparent 62%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />

      <div className="relative grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] tracking-[0.16em] text-white/60 uppercase">Light controls</div>
            <div className="text-foreground/90 text-[13px] leading-tight font-[var(--font-display)]">
              {props.state?.kind === 'mixed' ? 'Bulb + relay' : 'Smart bulb'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full border border-white/15 shadow-[0_18px_70px_rgba(0,0,0,0.55)]"
              style={{ background: deviceHex }}
              aria-hidden="true"
            />
            <div className="text-[11px] tracking-[0.16em] text-white/55 tabular-nums">{deviceHex}</div>
          </div>
        </div>

        <LightSlider
          label="Brightness"
          value={draftLum}
          onChange={(n) => {
            draggingRef.current.lum = true
            setDraftLum(n)
          }}
          onChangeEnd={(n) => {
            draggingRef.current.lum = false
            setDraftLum(n)
            void sendLight({ luminance: n })
          }}
          disabled={busy}
          track="luminance"
          tintHex={deviceHex}
        />

        <Tabs selectedKey={mode} onSelectionChange={(k) => setMode(k === 'white' ? 'white' : 'color')} className="mt-1">
          <TabList aria-label="Light mode" className="grid-cols-2">
            <Tab id="white">White</Tab>
            <Tab id="color">Color</Tab>
          </TabList>
          <TabPanels>
            <TabPanel id="white">
              <div className="mt-3 grid gap-3">
                <LightSlider
                  label="Temperature"
                  value={draftTemp}
                  onChange={(n) => {
                    draggingRef.current.temp = true
                    setDraftTemp(n)
                  }}
                  onChangeEnd={(n) => {
                    draggingRef.current.temp = false
                    setDraftTemp(n)
                    void sendLight({ luminance: draftLum, temperature: n })
                  }}
                  disabled={busy}
                  track="temperature"
                  tintHex={deviceHex}
                />

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    tone="ghost"
                    onPress={() => {
                      const n = 20
                      setDraftTemp(n)
                      void sendLight({ luminance: draftLum, temperature: n })
                    }}
                    isDisabled={busy}
                  >
                    Warm
                  </Button>
                  <Button
                    tone="quiet"
                    onPress={() => {
                      const n = 52
                      setDraftTemp(n)
                      void sendLight({ luminance: draftLum, temperature: n })
                    }}
                    isDisabled={busy}
                  >
                    Neutral
                  </Button>
                  <Button
                    tone="ghost"
                    onPress={() => {
                      const n = 84
                      setDraftTemp(n)
                      void sendLight({ luminance: draftLum, temperature: n })
                    }}
                    isDisabled={busy}
                  >
                    Cool
                  </Button>
                </div>
              </div>
            </TabPanel>

            <TabPanel id="color">
              <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr] md:items-center md:gap-4">
                <div className="mx-auto">
                  <ColorWheel
                    value={draftColor}
                    onChange={(c) => {
                      draggingRef.current.color = true
                      setDraftColor(c)
                    }}
                    onChangeEnd={(c) => {
                      draggingRef.current.color = false
                      setDraftColor(c)
                      const rgb = rgbIntFromColor(c)
                      if (rgb === null) return
                      void sendLight({ luminance: draftLum, rgb })
                    }}
                    outerRadius={72}
                    innerRadius={50}
                    aria-label="Hue"
                    isDisabled={busy}
                    className="relative"
                  >
                    <ColorWheelTrack
                      className="rounded-full shadow-[0_26px_90px_rgba(0,0,0,0.60)]"
                      style={({ defaultStyle, isDisabled }) => ({
                        ...defaultStyle,
                        background: isDisabled
                          ? undefined
                          : `${defaultStyle.background}, radial-gradient(closest-side, rgba(255,255,255,0.10), transparent 66%)`,
                      })}
                    />
                    <div
                      className="pointer-events-none absolute top-1/2 left-1/2 size-23 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12 shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
                      style={{
                        background: `radial-gradient(48px 40px at 34% 28%, rgba(255,255,255,0.22), transparent 60%), ${rgbToHex(
                          rgbIntFromColor(draftColor) ?? deviceRgb,
                        )}`,
                      }}
                      aria-hidden="true"
                    />
                    <ColorThumb
                      className={cls(
                        'h-7 w-7 rounded-full border-2 border-white shadow-[0_18px_60px_rgba(0,0,0,0.62)] outline-none',
                        'data-focus-visible:ring-2 data-focus-visible:ring-[color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
                      )}
                      style={({ defaultStyle, isDisabled }) => ({
                        ...defaultStyle,
                        backgroundColor: isDisabled ? undefined : defaultStyle.backgroundColor,
                        boxShadow:
                          '0 0 0 1px rgba(0,0,0,0.55), 0 22px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset',
                      })}
                    />
                  </ColorWheel>
                </div>

                <div className="grid gap-2">
                  <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Hue</div>
                  <div className="text-muted text-[13px] leading-snug">
                    Spin the ring to pick a color. Brightness stays on the slider above.
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {[
                      0xff3b3b, // red
                      0xff6a00, // orange
                      0xffd000, // amber
                      0x2dd4bf, // teal-ish
                      0x3b82f6, // blue
                      0xa855f7, // violet
                    ].map((rgb) => (
                      <button
                        key={rgb}
                        type="button"
                        className={cls(
                          'h-7 w-7 rounded-full border border-white/18 bg-black/20 shadow-[0_18px_60px_rgba(0,0,0,0.55)]',
                          'transition-[transform,border-color] duration-150 ease-out outline-none',
                          'hover:scale-[1.03] hover:border-white/28',
                          'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
                        )}
                        style={{ background: rgbToHex(rgb) }}
                        onClick={() => {
                          setDraftColor(parseColor(rgbToHex(rgb)))
                          void sendLight({ luminance: draftLum, rgb })
                        }}
                        disabled={busy}
                        aria-label={`Set color to ${rgbToHex(rgb)}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
          <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">
            {busy ? 'sending…' : onoff === 1 ? 'ready' : 'off'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cls(
                'inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] tracking-[0.16em] text-white/80 uppercase',
                'transition-[background,border-color] duration-150 ease-out outline-none',
                'hover:border-white/18 hover:bg-white/7',
                'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
              )}
              onClick={() => props.onRequestRefresh()}
              disabled={busy}
            >
              Sync
            </button>
            <button
              type="button"
              className={cls(
                'inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] tracking-[0.16em] text-white/80 uppercase',
                'transition-[background,border-color] duration-150 ease-out outline-none',
                'hover:border-white/18 hover:bg-white/7',
                'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
              )}
              onClick={() => void sendLight({ luminance: 0 })}
              disabled={busy}
            >
              Dim
            </button>
          </div>
        </div>

        {disabled ? (
          <div className="text-[12px] leading-snug text-white/55">
            Tip: if the bulb is off, switch it on first. Adjustments intentionally turn it on, but the state might lag a
            moment on slower Wi-Fi.
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function SmartLightActionWidget(props: {
  uuid: string
  state: DeviceStateLike | undefined
  onOpenTuning: () => void
  onRequestRefresh: () => void
}) {
  const toast = useToast()

  const light0 =
    props.state?.light ??
    props.state?.lights?.find((l) => l.channel === 0) ??
    (props.state?.lights?.length ? props.state.lights[0]! : null)

  const deviceLum = Number.isFinite(Number(light0?.luminance)) ? clamp(Number(light0?.luminance), 0, 100) : 50
  const deviceRgb = Number.isFinite(Number(light0?.rgb)) ? clamp(Number(light0?.rgb), 0, 0xffffff) : 0xff6a00
  const deviceHex = useMemo(() => rgbToHex(deviceRgb), [deviceRgb])

  const [draftLum, setDraftLum] = useState(deviceLum)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraftLum(deviceLum)
  }, [deviceLum])

  const sendLight = async (patch: { luminance?: number }) => {
    setBusy(true)
    try {
      await apiPost('/api/device/light', {
        uuid: props.uuid,
        channel: 0,
        onoff: 1,
        ...(patch.luminance !== undefined ? { luminance: clamp(Math.round(patch.luminance), 0, 100) } : {}),
      })
      props.onRequestRefresh()
    } catch (e) {
      toast.show({
        kind: 'err',
        title: 'Light update failed',
        detail: e instanceof Error ? e.message : 'Unknown error.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cls(
        'relative overflow-hidden rounded-full border border-white/12 bg-[rgba(9,12,18,0.42)] px-2.5 py-2',
        'shadow-[0_26px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150',
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(420px 140px at 10% 0%, rgba(255,106,0,0.14), transparent 62%), radial-gradient(460px 150px at 100% 0%, rgba(45,212,191,0.10), transparent 60%)`,
        }}
      />
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          className={cls(
            'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-black/20 shadow-[0_18px_60px_rgba(0,0,0,0.55)]',
            'transition-[transform,border-color,background] duration-150 ease-out outline-none',
            'hover:scale-[1.02] hover:border-white/22 hover:bg-white/5',
            'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
          )}
          onClick={props.onOpenTuning}
          disabled={busy}
          aria-label="Open light tuning"
        >
          <span
            className="h-5 w-5 rounded-full border border-white/18"
            style={{ background: deviceHex }}
            aria-hidden="true"
          />
        </button>

        <Slider
          value={clamp(Math.round(draftLum), 0, 100)}
          onChange={(v) => setDraftLum(Number(v))}
          onChangeEnd={(v) => {
            const n = Number(v)
            setDraftLum(n)
            void sendLight({ luminance: n })
          }}
          minValue={0}
          maxValue={100}
          step={1}
          isDisabled={busy}
          aria-label="Brightness"
          className="w-[min(180px,52vw)]"
        >
          <div className="relative h-9 rounded-full border border-white/10 bg-black/25">
            <SliderTrack className="group relative mx-3 h-full outline-none">
              {({ state, isDisabled }) => {
                const pct = state.getThumbPercent(0) * 100
                return (
                  <>
                    <div
                      className={cls('absolute inset-[7px] rounded-full', isDisabled ? 'opacity-50' : 'opacity-100')}
                      style={{
                        background: `linear-gradient(90deg, rgba(255,255,255,0.10), ${deviceHex})`,
                        filter: 'saturate(1.25) contrast(1.1)',
                      }}
                    />
                    <div
                      className="absolute inset-y-[7px] left-[7px] rounded-full"
                      style={{
                        width: `calc(${pct}% - 7px)`,
                        background: 'linear-gradient(90deg, rgba(255,106,0,0.16), transparent 82%)',
                      }}
                    />
                    <SliderThumb
                      className={cls(
                        'absolute top-1/2 h-6 w-6 rounded-full border border-white/18 bg-[rgba(8,10,14,0.78)] shadow-[0_16px_40px_rgba(0,0,0,0.55)] outline-none',
                        'data-[focus-visible]:ring-2 data-[focus-visible]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
                      )}
                      style={({ defaultStyle }) => ({
                        ...defaultStyle,
                        boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset`,
                      })}
                    />
                  </>
                )
              }}
            </SliderTrack>
          </div>
        </Slider>

        <div className="min-w-[3.25ch] pr-0.5 text-right text-[11px] tracking-[0.16em] text-white/60 tabular-nums">
          {Math.round(draftLum)}%
        </div>
      </div>
    </div>
  )
}

export function SmartLightQuickStrip(props: {
  uuid: string
  state: DeviceStateLike | undefined
  onOpenTuning: () => void
  onRequestRefresh: () => void
}) {
  const toast = useToast()

  const light0 =
    props.state?.light ??
    props.state?.lights?.find((l) => l.channel === 0) ??
    (props.state?.lights?.length ? props.state.lights[0]! : null)

  const deviceLum = Number.isFinite(Number(light0?.luminance)) ? clamp(Number(light0?.luminance), 0, 100) : 50
  const deviceRgb = Number.isFinite(Number(light0?.rgb)) ? clamp(Number(light0?.rgb), 0, 0xffffff) : 0xff6a00
  const deviceHex = useMemo(() => rgbToHex(deviceRgb), [deviceRgb])

  const [draftLum, setDraftLum] = useState(deviceLum)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraftLum(deviceLum)
  }, [deviceLum])

  const sendLight = async (patch: { luminance?: number }) => {
    setBusy(true)
    try {
      await apiPost('/api/device/light', {
        uuid: props.uuid,
        channel: 0,
        onoff: 1,
        ...(patch.luminance !== undefined ? { luminance: clamp(Math.round(patch.luminance), 0, 100) } : {}),
      })
      props.onRequestRefresh()
    } catch (e) {
      toast.show({
        kind: 'err',
        title: 'Light update failed',
        detail: e instanceof Error ? e.message : 'Unknown error.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-[rgba(9,12,18,0.42)] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(520px 120px at 18% 0%, rgba(255,106,0,0.18), transparent 58%), radial-gradient(520px 120px at 92% 0%, rgba(45,212,191,0.12), transparent 58%)`,
        }}
      />
      <div className="relative grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-full border border-white/15 shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
              style={{ background: deviceHex }}
              aria-hidden="true"
            />
            <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Quick</div>
          </div>
          <button
            type="button"
            className={cls(
              'inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] tracking-[0.16em] text-white/80 uppercase',
              'transition-[background,border-color] duration-150 ease-out outline-none',
              'hover:border-white/18 hover:bg-white/7',
              'focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
            )}
            onClick={props.onOpenTuning}
            disabled={busy}
          >
            Tune
          </button>
        </div>

        <Slider
          value={clamp(Math.round(draftLum), 0, 100)}
          onChange={(v) => setDraftLum(Number(v))}
          onChangeEnd={(v) => {
            const n = Number(v)
            setDraftLum(n)
            void sendLight({ luminance: n })
          }}
          minValue={0}
          maxValue={100}
          step={1}
          isDisabled={busy}
          className="grid gap-2"
        >
          <div className="flex items-end justify-between gap-3">
            <Label className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Brightness</Label>
            <SliderOutput className="text-[11px] tracking-[0.16em] text-white/55 tabular-nums">
              {({ state }) => `${Math.round(state.getThumbValue(0))}`}
            </SliderOutput>
          </div>

          <SliderTrack className="group relative h-10 rounded-full border border-white/10 bg-black/25 px-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] outline-none">
            {({ state, isDisabled }) => {
              const pct = state.getThumbPercent(0) * 100
              return (
                <>
                  <div
                    className={cls('absolute inset-[7px] rounded-full', isDisabled ? 'opacity-50' : 'opacity-100')}
                    style={{
                      background: `linear-gradient(90deg, rgba(255,255,255,0.10), ${deviceHex})`,
                      filter: 'saturate(1.25) contrast(1.1)',
                    }}
                  />
                  <div
                    className="absolute inset-y-[7px] left-[7px] rounded-full"
                    style={{
                      width: `calc(${pct}% - 7px)`,
                      background: 'linear-gradient(90deg, rgba(255,106,0,0.18), transparent 80%)',
                    }}
                  />
                  <SliderThumb
                    className={cls(
                      'absolute top-1/2 h-6 w-6 rounded-full border border-white/18 bg-[rgba(8,10,14,0.78)] shadow-[0_16px_40px_rgba(0,0,0,0.55)] outline-none',
                      'data-[focus-visible]:ring-2 data-[focus-visible]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_28%,transparent)]',
                    )}
                    style={({ defaultStyle }) => ({
                      ...defaultStyle,
                      boxShadow: `0 0 0 1px rgba(0,0,0,0.55), 0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset`,
                    })}
                  />
                </>
              )
            }}
          </SliderTrack>
        </Slider>
      </div>
    </div>
  )
}
