import { getSystemAll } from '../meross'
import {
  apiErr,
  apiOk,
  extractLanLight,
  extractLanToggleX,
  extractLanTimerXDigest,
  extractLanTriggerXDigest,
  parseJsonBody,
  requireLanHost,
  requireLanKey,
} from './shared'
import type { StatePollerService } from './state-poller'

export const createGetDeviceStateHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Read current device state for a channel from LAN system digest.
   * Input: POST JSON `{ uuid, channel? }` (`channel` defaults to `0`).
   * Output: `{ ok: true, data: { host, channel, onoff, channels, lights, light, kind } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    if (poller) {
      const result = await poller.pollNow({ uuids: [uuid], reason: 'manual' })
      const failed = result.errors.find((e) => e.uuid === uuid)
      if (failed) return apiErr(failed.message, failed.code)

      const state = result.states.find((s) => s.uuid === uuid)
      if (!state) return apiErr('State unavailable', 'state_unavailable')
      const toggleMatch = state.channels.find((t) => t.channel === channel) ?? null
      const lightMatch = state.lights.find((t) => t.channel === channel) ?? null
      const match = lightMatch ?? toggleMatch ?? null
      if (!match) return apiErr('Channel not found', 'state_unavailable')
      return apiOk({
        host: state.host,
        kind: state.kind,
        channel: match.channel,
        onoff: match.onoff,
        channels: state.channels,
        lights: state.lights,
        light: state.light,
        timerxDigest: state.timerxDigest,
        triggerxDigest: state.triggerxDigest,
      })
    }

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      // Keep this a bit snappier than a full system dump fetch.
      const data = await getSystemAll<any>({ host, key, timeoutMs: 3000 })
      const togglex = extractLanToggleX(data)
      const lights = extractLanLight(data) ?? []
      const timerxDigest = extractLanTimerXDigest(data)
      const triggerxDigest = extractLanTriggerXDigest(data)
      const toggleMatch = togglex?.find((t) => t.channel === channel) ?? null
      const lightMatch = lights.find((t) => t.channel === channel) ?? null
      const match = lightMatch ?? toggleMatch ?? null
      if (!match) return apiErr('State not found in Appliance.System.All digest', 'state_unavailable')

      const light0 = lights.find((l) => l.channel === 0) ?? (lights.length ? lights[0]! : null)
      const ch0 = togglex?.find((c) => c.channel === 0) ?? (togglex?.length ? togglex[0]! : null)
      const kind = light0 && ch0 ? 'mixed' : light0 ? 'light' : 'togglex'

      return apiOk({
        host,
        kind,
        channel: match.channel,
        onoff: match.onoff,
        channels: togglex ?? [],
        lights,
        light: light0,
        timerxDigest,
        triggerxDigest,
      })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
