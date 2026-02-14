export type CloudSummary = {
  domain: string
  mqttDomain?: string
  userId: string
  userEmail: string
  key: string
  tokenRedacted: string
}

export type MerossCloudDevice = {
  uuid: string
  devName?: string
  deviceType?: string
  subType?: string
  onlineStatus?: string
  macAddress?: string
  mac?: string
  channels?: Array<Record<string, unknown>>
  [k: string]: unknown
}
