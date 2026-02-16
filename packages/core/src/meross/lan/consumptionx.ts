import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

// Meross smart plugs expose daily energy totals (Wh) via ConsumptionX.
export const NAMESPACE_CONSUMPTIONX = 'Appliance.Control.ConsumptionX'

export type ConsumptionXGetPayload = {
  consumptionx: {
    channel: number
  }
}

export type ConsumptionXEntry = {
  // YYYY-MM-DD
  date: string
  // Epoch seconds (device-reported timestamp for the reading)
  time: number
  // Daily energy total, Wh
  value: number
}

export type ConsumptionXResponsePayload = {
  consumptionx: ConsumptionXEntry[]
}

export type GetConsumptionXOptions = {
  host: string
  key: string
  channel?: number
  timeoutMs?: number
}

export const getConsumptionX = async <TResponse = unknown>(
  options: GetConsumptionXOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload: ConsumptionXGetPayload = { consumptionx: { channel: options.channel ?? 0 } }
  const msg = buildLanMessage({
    namespace: NAMESPACE_CONSUMPTIONX,
    method: 'GET',
    payload,
    key: options.key,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

