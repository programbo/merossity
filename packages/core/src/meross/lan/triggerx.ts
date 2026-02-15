import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

export const NAMESPACE_TRIGGERX = 'Appliance.Control.TriggerX'

export type GetTriggerXOptions = {
  host: string
  key: string
  id: string
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const getTriggerX = async <TResponse = unknown>(
  options: GetTriggerXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload = { triggerx: { id: options.id } }
  const msg = buildLanMessage({
    namespace: NAMESPACE_TRIGGERX,
    method: 'GET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

export type SetTriggerXOptions = {
  host: string
  key: string
  trigger: Record<string, unknown>
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const setTriggerX = async <TResponse = unknown>(
  options: SetTriggerXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload = { triggerx: options.trigger }
  const msg = buildLanMessage({
    namespace: NAMESPACE_TRIGGERX,
    method: 'SET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}
