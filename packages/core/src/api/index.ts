import { createDiscoverHostsHandler } from './discover-hosts'
import { createGetCloudCredsHandler } from './get-cloud-creds'
import { createGetCloudDevicesHandler } from './get-cloud-devices'
import { createGetDeviceStateHandler } from './get-device-state'
import { createGetDeviceSystemAllHandler } from './get-device-system-all'
import { createGetHostsHandler } from './get-hosts'
import { createGetStatusHandler } from './get-status'
import { createLoginCloudHandler } from './login-cloud'
import { createRefreshCloudDevicesHandler } from './refresh-cloud-devices'
import { createResolveHostHandler } from './resolve-host'
import { createSuggestLanCidrHandler } from './suggest-lan-cidr'
import { createToggleDeviceHandler } from './toggle-device'
import type { ApiRoutes } from './types'

export type { ApiRouteDeps, ApiRouteHandler, ApiRoutes } from './types'

export const createApiRoutes = (): ApiRoutes => {
  const suggestLanCidr = createSuggestLanCidrHandler()
  const getStatus = createGetStatusHandler()
  const loginCloud = createLoginCloudHandler()
  const getCloudCreds = createGetCloudCredsHandler()
  const getCloudDevices = createGetCloudDevicesHandler()
  const refreshCloudDevices = createRefreshCloudDevicesHandler()
  const getHosts = createGetHostsHandler()
  const resolveHost = createResolveHostHandler()
  const discoverHosts = createDiscoverHostsHandler()
  const getDeviceSystemAll = createGetDeviceSystemAllHandler()
  const getDeviceState = createGetDeviceStateHandler()
  const toggleDevice = createToggleDeviceHandler()

  return {
    '/api/lan/cidr-suggest': suggestLanCidr,

    '/api/status': getStatus,
    '/api/cloud/login': loginCloud,
    '/api/cloud/creds': getCloudCreds,
    '/api/cloud/devices': getCloudDevices,
    '/api/cloud/devices/refresh': refreshCloudDevices,
    '/api/hosts': getHosts,
    '/api/hosts/resolve': resolveHost,
    '/api/hosts/discover': discoverHosts,

    '/api/device/system-all': getDeviceSystemAll,
    '/api/device/state': getDeviceState,
    '/api/device/toggle': toggleDevice,
  }
}

export { applySecurityHeaders } from './applySecurityHeaders'
