export type MerossCloudDump = {
  cloud: {
    domain: string
    key: string
    mqtt_domain: string
    token_redacted?: string
    user_email?: string
    user_id?: string
  }
  devices: MerossCloudDumpDevice[]
}

export type MerossCloudDumpDevice = {
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
  // Not always present in dumps, but useful for LAN lookups.
  macAddress?: string
  mac?: string
  // Allow extra fields from SDK dumps without losing type-safety in our code.
  [k: string]: unknown
}
