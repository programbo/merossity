import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

export const NAMESPACE_LIGHT = 'Appliance.Control.Light'

export type LightPayload = {
  light: {
    channel: number
    onoff?: 0 | 1
    luminance?: number
    temperature?: number
    rgb?: number
    capacity?: number
    transform?: number
  }
}

export type SetLightOptions = {
  host: string
  key: string
  channel?: number
  onoff?: 0 | 1
  luminance?: number
  temperature?: number
  rgb?: number
  capacity?: number
  transform?: number
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const setLight = async <TResponse = unknown>(
  options: SetLightOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const light: LightPayload['light'] = {
    channel: options.channel ?? 0,
    ...(options.onoff !== undefined ? { onoff: options.onoff } : {}),
    ...(options.luminance !== undefined ? { luminance: options.luminance } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.rgb !== undefined ? { rgb: options.rgb } : {}),
    ...(options.capacity !== undefined ? { capacity: options.capacity } : {}),
    ...(options.transform !== undefined ? { transform: options.transform } : {}),
  }

  const payload: LightPayload = { light }
  const msg = buildLanMessage({
    namespace: NAMESPACE_LIGHT,
    method: 'SET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })

  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

