export type MerossCloudCredentials = {
  // Cloud HTTP API base, without scheme. Example: "iotx-ap.meross.com".
  domain: string
  mqttDomain?: string
  token: string
  key: string
  userId: string
  userEmail: string
}

export type MerossCloudDevice = {
  uuid: string
  devName?: string
  deviceType?: string
  subType?: string
  onlineStatus?: string
  bindTime?: string
  fmwareVersion?: string
  hdwareVersion?: string
  region?: string
  domain?: string
  reservedDomain?: string
  channels?: Array<Record<string, unknown>>
  [k: string]: unknown
}

export type MerossCloudApiResponse<T> = {
  apiStatus: number
  info?: string
  data: T
}

export class MerossCloudError extends Error {
  override name = 'MerossCloudError'
  constructor(
    message: string,
    public apiStatus?: number,
    public info?: string,
  ) {
    super(message)
  }
}

