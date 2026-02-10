import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

export const NAMESPACE_TOGGLEX = 'Appliance.Control.ToggleX'

export type ToggleXPayload = {
  togglex: {
    channel: number
    onoff: 0 | 1
  }
}

export type SetToggleXOptions = {
  host: string
  key: string
  channel?: number
  onoff: 0 | 1
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const setToggleX = async <TResponse = unknown>(
  options: SetToggleXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload: ToggleXPayload = { togglex: { channel: options.channel ?? 0, onoff: options.onoff } }
  const msg = buildLanMessage({
    namespace: NAMESPACE_TOGGLEX,
    method: 'SET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

