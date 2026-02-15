import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

export const NAMESPACE_TIMERX = 'Appliance.Control.TimerX'

export type GetTimerXOptions = {
  host: string
  key: string
  id: string
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const getTimerX = async <TResponse = unknown>(
  options: GetTimerXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload = { timerx: { id: options.id } }
  const msg = buildLanMessage({
    namespace: NAMESPACE_TIMERX,
    method: 'GET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

export type SetTimerXOptions = {
  host: string
  key: string
  timer: Record<string, unknown>
  from?: string
  triggerSrc?: string
  timeoutMs?: number
}

export const setTimerX = async <TResponse = unknown>(
  options: SetTimerXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload = { timerx: options.timer }
  const msg = buildLanMessage({
    namespace: NAMESPACE_TIMERX,
    method: 'SET',
    payload,
    key: options.key,
    from: options.from,
    triggerSrc: options.triggerSrc,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

