import crypto from 'node:crypto'

export type MerossLanHeader = {
  messageId: string
  namespace: string
  method: string
  payloadVersion: number
  from: string
  triggerSrc: string
  timestamp: number
  timestampMs: number
  sign: string
}

export type MerossLanMessage<Payload extends Record<string, unknown> = Record<string, unknown>> = {
  header: MerossLanHeader
  payload: Payload
}

export type BuildLanMessageOptions<Payload extends Record<string, unknown>> = {
  namespace: string
  method: string
  payload: Payload
  key: string
  from?: string
  triggerSrc?: string
  payloadVersion?: number
  // Testability hooks.
  messageId?: string
  timestamp?: number
}

export const DEFAULT_FROM = 'MerossClient'
export const DEFAULT_TRIGGER_SRC = 'MerossClient'

export const md5Hex = (s: string): string => crypto.createHash('md5').update(s, 'utf8').digest('hex')

const randomMessageId = (): string => crypto.randomUUID().replaceAll('-', '')

export const buildLanMessage = <Payload extends Record<string, unknown>>(
  options: BuildLanMessageOptions<Payload>,
): MerossLanMessage<Payload> => {
  const ts = options.timestamp ?? Math.floor(Date.now() / 1000)
  const messageId = options.messageId ?? randomMessageId()

  const from = options.from ?? DEFAULT_FROM
  const triggerSrc = options.triggerSrc ?? DEFAULT_TRIGGER_SRC
  const payloadVersion = options.payloadVersion ?? 1

  // Per Meross LAN HTTP signature: sign = md5(messageId + key + timestamp)
  const sign = md5Hex(`${messageId}${options.key}${ts}`)

  return {
    header: {
      messageId,
      namespace: options.namespace,
      method: options.method,
      payloadVersion,
      from,
      triggerSrc,
      timestamp: ts,
      timestampMs: 0,
      sign,
    },
    payload: options.payload,
  }
}

