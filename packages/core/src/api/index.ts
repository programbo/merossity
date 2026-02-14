import { createDiscoverHostsHandler } from './discover-hosts'
import { createGetCloudCredsHandler } from './get-cloud-creds'
import { createGetCloudDevicesHandler } from './get-cloud-devices'
import { createGetDeviceStateHandler } from './get-device-state'
import { createGetDeviceStatesHandler } from './get-device-states'
import { createGetDeviceSystemAllHandler } from './get-device-system-all'
import { createGetEventsStatusHandler } from './get-events-status'
import { createGetEventsStreamHandler } from './get-events-stream'
import { createGetHostsHandler } from './get-hosts'
import { createGetStatusHandler } from './get-status'
import { createLoginCloudHandler } from './login-cloud'
import { createNetworkCidrHandler } from './network-cidr'
import { createRefreshCloudDevicesHandler } from './refresh-cloud-devices'
import { createResolveHostHandler } from './resolve-host'
import { getStatePollerService } from './state-poller'
import { createSuggestLanCidrHandler } from './suggest-lan-cidr'
import { createToggleDeviceHandler } from './toggle-device'
import type { ApiRoutes } from './types'

export type { ApiRouteDeps, ApiRouteHandler, ApiRoutes } from './types'

export const createApiRoutes = (): ApiRoutes => {
  const statePoller = getStatePollerService()
  const suggestLanCidr = createSuggestLanCidrHandler()
  const getStatus = createGetStatusHandler()
  const loginCloud = createLoginCloudHandler()
  const getCloudCreds = createGetCloudCredsHandler()
  const getCloudDevices = createGetCloudDevicesHandler()
  const refreshCloudDevices = createRefreshCloudDevicesHandler()
  const getHosts = createGetHostsHandler()
  const resolveHost = createResolveHostHandler()
  const discoverHosts = createDiscoverHostsHandler()
  const networkCidr = createNetworkCidrHandler()
  const getDeviceSystemAll = createGetDeviceSystemAllHandler()
  const getDeviceState = createGetDeviceStateHandler(statePoller)
  const getDeviceStates = createGetDeviceStatesHandler(statePoller)
  const toggleDevice = createToggleDeviceHandler(statePoller)
  const eventsStream = createGetEventsStreamHandler(statePoller)
  const eventsStatus = createGetEventsStatusHandler(statePoller)

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
    '/api/network/cidr': networkCidr,

    '/api/device/system-all': getDeviceSystemAll,
    '/api/device/state': getDeviceState,
    '/api/device/states': getDeviceStates,
    '/api/device/toggle': toggleDevice,
    '/api/events/stream': eventsStream,
    '/api/events/status': eventsStatus,
  }
}

export { applySecurityHeaders } from './applySecurityHeaders'
