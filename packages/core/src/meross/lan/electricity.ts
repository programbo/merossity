import { postConfig, type PostConfigOptions } from './http'
import { buildLanMessage } from './message'

// Meross smart plugs expose live electrical measurements here.
export const NAMESPACE_ELECTRICITY = 'Appliance.Control.Electricity'

export type ElectricityPayload = {
  electricity: {
    channel: number
    // Raw units (per Meross devices / community docs):
    // - voltage: deci-volts (e.g. 2256 => 225.6V)
    // - current: milliamps
    // - power: milliwatts
    voltage?: number
    current?: number
    power?: number
    config?: {
      voltageRatio?: number
      electricityRatio?: number
    }
  }
}

export type GetElectricityOptions = {
  host: string
  key: string
  channel?: number
  timeoutMs?: number
}

export const getElectricity = async <TResponse = unknown>(
  options: GetElectricityOptions,
  postOptions: Omit<PostConfigOptions, 'timeoutMs'> = {},
): Promise<TResponse> => {
  const payload: ElectricityPayload = { electricity: { channel: options.channel ?? 0 } }
  const msg = buildLanMessage({
    namespace: NAMESPACE_ELECTRICITY,
    method: 'GET',
    payload,
    key: options.key,
  })
  return await postConfig<TResponse>(options.host, msg, { ...postOptions, timeoutMs: options.timeoutMs })
}

