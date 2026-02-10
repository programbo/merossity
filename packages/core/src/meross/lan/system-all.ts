import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

export const NAMESPACE_SYSTEM_ALL = 'Appliance.System.All'

export type GetSystemAllOptions = {
  host: string
  key: string
  timeoutMs?: number
}

export const getSystemAll = async <TResponse = unknown>(
  options: GetSystemAllOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const msg = buildLanMessage({
    namespace: NAMESPACE_SYSTEM_ALL,
    method: 'GET',
    payload: {},
    key: options.key,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

